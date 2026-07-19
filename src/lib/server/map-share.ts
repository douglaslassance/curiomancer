import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from './db';
import { mapShare } from './db/schema';

/**
 * Unguessable capability token for a share link (~144 bits of entropy).
 * base64url so it's URL-safe with no padding.
 */
function mintToken(): string {
	return randomBytes(18).toString('base64url');
}

/**
 * The user's stable "share my likes" token, minting one on first use. The
 * token is a capability: anyone who has it can view the user's liked-places
 * map, but it can't be guessed or derived from the user id.
 */
export async function getOrCreateMapShareToken(userId: string): Promise<string> {
	const [existing] = await db
		.select({ token: mapShare.token })
		.from(mapShare)
		.where(eq(mapShare.userId, userId))
		.limit(1);
	if (existing) return existing.token;

	// onConflictDoUpdate on the unique userId turns a race (two concurrent
	// first-time requests) into a no-op update that still RETURNs the row's
	// token, so both callers get the same stable link.
	const [row] = await db
		.insert(mapShare)
		.values({ token: mintToken(), userId })
		.onConflictDoUpdate({ target: mapShare.userId, set: { userId } })
		.returning({ token: mapShare.token });
	return row.token;
}

/** Resolve a share token to its owner's user id, or null if unknown. */
export async function getUserIdByMapShareToken(token: string): Promise<string | null> {
	const [row] = await db
		.select({ userId: mapShare.userId })
		.from(mapShare)
		.where(eq(mapShare.token, token))
		.limit(1);
	return row?.userId ?? null;
}
