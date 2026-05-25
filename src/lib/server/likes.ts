import { and, eq } from 'drizzle-orm';
import { db } from './db';
import { like } from './db/schema';

/** All place IDs the user has liked. Returns an empty set if no user. */
export async function getLikedPlaceIds(userId: string | undefined): Promise<Set<string>> {
	if (!userId) return new Set();
	const rows = await db.select({ placeId: like.placeId }).from(like).where(eq(like.userId, userId));
	return new Set(rows.map((r) => r.placeId));
}

/** Toggle a like. Returns the new liked state. */
export async function toggleLike(userId: string, placeId: string): Promise<boolean> {
	const existing = await db
		.select({ id: like.id })
		.from(like)
		.where(and(eq(like.userId, userId), eq(like.placeId, placeId)))
		.limit(1);

	if (existing.length > 0) {
		await db.delete(like).where(eq(like.id, existing[0].id));
		return false;
	}
	await db.insert(like).values({ userId, placeId }).onConflictDoNothing();
	return true;
}

/** Insert any place IDs not already liked. Used to merge anonymous likes on sign-in. */
export async function mergeLikes(userId: string, placeIds: string[]): Promise<number> {
	if (placeIds.length === 0) return 0;
	const rows = placeIds.map((placeId) => ({ userId, placeId }));
	const result = await db.insert(like).values(rows).onConflictDoNothing().returning({ id: like.id });
	return result.length;
}
