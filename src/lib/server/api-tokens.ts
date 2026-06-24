/**
 * Personal access tokens for the public API.
 *
 * Tokens are high-entropy random strings prefixed with `crmc_`. We never
 * store the plaintext - only a SHA-256 hash - so a leaked database can't
 * be used to impersonate API clients. The plaintext is returned to the
 * caller exactly once, at creation time.
 */
import { createHash, randomBytes } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import { db } from './db';
import { apiToken } from './db/schema';

const PREFIX = 'crmc_';

function hashToken(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}

/** Create a token for `userId`, returning the plaintext to show once. */
export async function createApiToken(userId: string, name: string): Promise<string> {
	const token = PREFIX + randomBytes(24).toString('base64url');
	await db.insert(apiToken).values({
		userId,
		name,
		tokenHash: hashToken(token),
		// Enough to disambiguate in the UI without revealing the secret.
		tokenPrefix: token.slice(0, PREFIX.length + 6)
	});
	return token;
}

export async function listApiTokens(userId: string) {
	return db
		.select({
			id: apiToken.id,
			name: apiToken.name,
			prefix: apiToken.tokenPrefix,
			createdAt: apiToken.createdAt,
			lastUsedAt: apiToken.lastUsedAt
		})
		.from(apiToken)
		.where(eq(apiToken.userId, userId))
		.orderBy(desc(apiToken.createdAt));
}

/** Revoke a token. Scoped to `userId` so you can only delete your own. */
export async function revokeApiToken(userId: string, id: string): Promise<void> {
	await db.delete(apiToken).where(and(eq(apiToken.id, id), eq(apiToken.userId, userId)));
}

/**
 * Resolve an `Authorization: Bearer <token>` header to a user id, or null
 * if the header is missing/malformed/unknown. Bumps `lastUsedAt` on a hit.
 */
export async function authenticateToken(authHeader: string | null): Promise<string | null> {
	if (!authHeader) return null;
	const match = authHeader.match(/^Bearer\s+(.+)$/i);
	if (!match) return null;

	const hash = hashToken(match[1].trim());
	const [row] = await db
		.select({ userId: apiToken.userId })
		.from(apiToken)
		.where(eq(apiToken.tokenHash, hash))
		.limit(1);
	if (!row) return null;

	await db.update(apiToken).set({ lastUsedAt: new Date() }).where(eq(apiToken.tokenHash, hash));
	return row.userId;
}
