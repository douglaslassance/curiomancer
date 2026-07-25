/**
 * Personal access tokens for the public API.
 *
 * Tokens are high-entropy random strings prefixed with `crmc_`. We never
 * store the plaintext - only a SHA-256 hash - so a leaked database can't
 * be used to impersonate API clients. The plaintext is returned to the
 * caller exactly once, at creation time.
 */
import { createHash, randomBytes } from 'node:crypto';
import { and, count, desc, eq, or, sql } from 'drizzle-orm';
import { db } from './db';
import { apiToken } from './db/schema';
import { user } from './db/auth.schema';

const PREFIX = 'crmc_';

/**
 * How many *personal* tokens `userId` has, checked against user.api_token_limit.
 * Device tokens are deliberately excluded: they're minted by signing in on a
 * phone, not chosen by the user, so counting them would let logging in on a new
 * device eat an integration slot (and, before that was true, silently push the
 * total past the limit).
 */
export async function countApiTokens(userId: string): Promise<number> {
	const [row] = await db
		.select({ n: count() })
		.from(apiToken)
		.where(and(eq(apiToken.userId, userId), eq(apiToken.kind, 'personal')));
	return row?.n ?? 0;
}

function hashToken(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}

function mintToken(): { token: string; hash: string; prefix: string } {
	const token = PREFIX + randomBytes(24).toString('base64url');
	return {
		token,
		hash: hashToken(token),
		// Enough to disambiguate in the UI without revealing the secret.
		prefix: token.slice(0, PREFIX.length + 6)
	};
}

/** Create a personal token for `userId`, returning the plaintext to show once. */
export async function createApiToken(userId: string, name: string): Promise<string> {
	const { token, hash, prefix } = mintToken();
	await db.insert(apiToken).values({
		userId,
		name,
		kind: 'personal',
		tokenHash: hash,
		tokenPrefix: prefix
	});
	return token;
}

/**
 * How long a device token survives without being used. It's a sliding window,
 * not a fixed lifetime: `authenticateToken` bumps `last_used_at` on every
 * request, so a phone in daily use never ages out, and one sitting in a drawer
 * recycles itself.
 *
 * This is what does the routine recycling, so no one is ever asked to tidy up a
 * device list. It also bounds how long a credential on a lost phone stays live,
 * which a count cap alone never does.
 *
 * Personal tokens don't expire. Those are deliberately wired into something,
 * and an integration that dies quietly after 90 days is worse than one that
 * keeps working until it's revoked on purpose.
 */
const DEVICE_TOKEN_TTL_DAYS = 90;

/**
 * Hard ceiling on a user's live device tokens, as an abuse backstop rather than
 * a product limit. Device tokens sit outside `api_token_limit`, and a client
 * that sends a fresh `deviceId` each sign-in mints a new row every time, so
 * without a ceiling one account can grow rows without bound.
 *
 * Set far above any real usage on purpose. The failure mode of a tight cap is
 * signing a genuine device out to make room, which is exactly the housekeeping
 * the TTL exists to avoid, so this should only ever bite someone doing it
 * deliberately. Eviction is least-recently-used rather than refusing the
 * sign-in: a real user on a new phone must never be locked out by their own
 * stale rows.
 */
const MAX_DEVICE_TOKENS = 20;

/** Cutoff for `COALESCE(last_used_at, created_at)`: older than this is stale. */
function deviceTokenCutoff(): Date {
	return new Date(Date.now() - DEVICE_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
}

/** A device token is live if it was used (or, if never used, minted) since the cutoff. */
const deviceTokenLive = (cutoff: Date) =>
	sql`COALESCE(${apiToken.lastUsedAt}, ${apiToken.createdAt}) >= ${cutoff}`;

/**
 * Mint the device token a native client signs in with, replacing this device's
 * previous token so repeated sign-ins on one phone don't pile up rows, and
 * clearing out any of this user's device tokens that have gone stale.
 *
 * `deviceId` is required: without it a device token would be indistinguishable
 * from every other device token of the same user, and "replace this phone's
 * token" degrades into "sign every other device out".
 *
 * Always issues a fresh secret: the old one is dropped, so signing in again is
 * also the way a user rotates a device credential they think is compromised.
 */
export async function issueDeviceToken(
	userId: string,
	name: string,
	deviceId: string
): Promise<string> {
	const { token, hash, prefix } = mintToken();

	await db.transaction(async (tx) => {
		await tx
			.delete(apiToken)
			.where(
				and(
					eq(apiToken.userId, userId),
					eq(apiToken.kind, 'device'),
					eq(apiToken.deviceId, deviceId)
				)
			);
		await tx.insert(apiToken).values({
			userId,
			name,
			kind: 'device',
			deviceId,
			tokenHash: hash,
			tokenPrefix: prefix
		});

		// Sweep this user's stale devices while we're here. There's no scheduled
		// job to lean on, and signing in is the moment their device list is about
		// to be looked at, so it's where the rows are worth reclaiming. Expired
		// tokens are already rejected at authentication; this just stops dead rows
		// accumulating. Scoped to `kind = 'device'` so personal tokens, which have
		// no TTL, can never be caught by it.
		await tx
			.delete(apiToken)
			.where(
				and(
					eq(apiToken.userId, userId),
					eq(apiToken.kind, 'device'),
					sql`COALESCE(${apiToken.lastUsedAt}, ${apiToken.createdAt}) < ${deviceTokenCutoff()}`
				)
			);

		// Backstop for what the TTL can't catch: rows minted faster than they go
		// stale. Runs after the sweep, so it only counts tokens that are still
		// live. The row just inserted has a null last_used_at and so orders by
		// created_at = now(), putting it first and never among the evicted.
		await tx.execute(sql`
			DELETE FROM api_token
			WHERE id IN (
				SELECT id FROM api_token
				WHERE user_id = ${userId} AND kind = 'device'
				ORDER BY COALESCE(last_used_at, created_at) DESC
				OFFSET ${MAX_DEVICE_TOKENS}
			)
		`);
	});

	return token;
}

/**
 * A user's own tokens, split by kind. Personal ones are the "plug my taste into
 * something else" credentials shown under API tokens; device ones back the
 * Devices list, where the affordance is signing a phone out rather than
 * revoking an integration.
 *
 * Stale device tokens are left out: they no longer authenticate, so listing one
 * would offer to sign out a device that is already signed out.
 */
export async function listApiTokens(userId: string) {
	const cutoff = deviceTokenCutoff();
	const rows = await db
		.select({
			id: apiToken.id,
			name: apiToken.name,
			kind: apiToken.kind,
			prefix: apiToken.tokenPrefix,
			createdAt: apiToken.createdAt,
			lastUsedAt: apiToken.lastUsedAt
		})
		.from(apiToken)
		.where(
			and(eq(apiToken.userId, userId), or(eq(apiToken.kind, 'personal'), deviceTokenLive(cutoff)))
		)
		.orderBy(desc(apiToken.createdAt));

	return {
		personal: rows.filter((r) => r.kind === 'personal'),
		devices: rows.filter((r) => r.kind === 'device')
	};
}

/** Revoke a token. Scoped to `userId` so you can only delete your own. */
export async function revokeApiToken(userId: string, id: string): Promise<void> {
	await db.delete(apiToken).where(and(eq(apiToken.id, id), eq(apiToken.userId, userId)));
}

/**
 * Every token across all users, with its owner, for the admin console. Newest
 * first. Deliberately exposes only the prefix, never the hash, so the admin
 * table can't become a way to reconstruct a credential.
 */
export async function getAllApiTokens() {
	return db
		.select({
			id: apiToken.id,
			name: apiToken.name,
			kind: apiToken.kind,
			prefix: apiToken.tokenPrefix,
			createdAt: apiToken.createdAt,
			lastUsedAt: apiToken.lastUsedAt,
			userId: apiToken.userId,
			userName: user.name,
			userEmail: user.email
		})
		.from(apiToken)
		.innerJoin(user, eq(apiToken.userId, user.id))
		.orderBy(desc(apiToken.createdAt));
}

/**
 * Revoke any token by id, regardless of owner. Admin console only - the
 * user-facing path is `revokeApiToken`, which is scoped to the caller.
 */
export async function adminRevokeApiToken(id: string): Promise<boolean> {
	const removed = await db
		.delete(apiToken)
		.where(eq(apiToken.id, id))
		.returning({ id: apiToken.id });
	return removed.length > 0;
}

/**
 * Resolve an `Authorization: Bearer <token>` header to a user id, or null
 * if the header is missing/malformed/unknown/expired. Bumps `lastUsedAt` on a
 * hit, which is what slides a device token's window forward.
 *
 * The staleness check reads the *stored* `last_used_at` before the bump, so an
 * expired token can't revive itself by being presented. Only device tokens
 * expire; personal ones live until revoked.
 */
export async function authenticateToken(authHeader: string | null): Promise<string | null> {
	if (!authHeader) return null;
	const match = authHeader.match(/^Bearer\s+(.+)$/i);
	if (!match) return null;

	const hash = hashToken(match[1].trim());
	const [row] = await db
		.select({
			userId: apiToken.userId,
			kind: apiToken.kind,
			createdAt: apiToken.createdAt,
			lastUsedAt: apiToken.lastUsedAt
		})
		.from(apiToken)
		.where(eq(apiToken.tokenHash, hash))
		.limit(1);
	if (!row) return null;

	if (row.kind === 'device' && (row.lastUsedAt ?? row.createdAt) < deviceTokenCutoff()) {
		return null;
	}

	await db.update(apiToken).set({ lastUsedAt: new Date() }).where(eq(apiToken.tokenHash, hash));
	return row.userId;
}
