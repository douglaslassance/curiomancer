import { and, eq } from 'drizzle-orm';
import { db } from './db';
import { placeRelation, type PlaceRelationKind } from './db/schema';

/**
 * Server helpers around the `place_relation` table (formerly `like`).
 *
 * The file is still called likes.ts because most callers care specifically
 * about the positive "liked" slice. Functions either default to 'liked'
 * or accept a `kind` argument to operate on dislikes / want-to-go.
 */

/**
 * Every place the user has a stance on, as a placeId to kind map. One query
 * instead of four `getPlaceIdsByKind` calls when a caller needs to annotate a
 * list of places with the viewer's relation (the /api/v1 places and rate
 * routes lean on this).
 */
export async function getRelationMap(
	userId: string | undefined
): Promise<Record<string, PlaceRelationKind>> {
	if (!userId) return {};
	const rows = await db
		.select({ placeId: placeRelation.placeId, kind: placeRelation.kind })
		.from(placeRelation)
		.where(eq(placeRelation.userId, userId));
	const map: Record<string, PlaceRelationKind> = {};
	for (const r of rows) map[r.placeId] = r.kind;
	return map;
}

/** All place IDs the user has marked with the given relation. */
export async function getPlaceIdsByKind(
	userId: string | undefined,
	kind: PlaceRelationKind = 'liked'
): Promise<Set<string>> {
	if (!userId) return new Set();
	const rows = await db
		.select({ placeId: placeRelation.placeId })
		.from(placeRelation)
		.where(and(eq(placeRelation.userId, userId), eq(placeRelation.kind, kind)));
	return new Set(rows.map((r) => r.placeId));
}

/** Backwards-compatible alias for callers that only ever want liked IDs. */
export const getLikedPlaceIds = (userId: string | undefined) => getPlaceIdsByKind(userId, 'liked');

/**
 * Set the user's relation to a place to `kind`, or clear it if the row
 * already matches `kind` (toggle behavior). Returns the resulting state
 * (`'liked' | 'disliked' | 'want_to_go' | null`).
 */
export async function setRelation(
	userId: string,
	placeId: string,
	kind: PlaceRelationKind
): Promise<PlaceRelationKind | null> {
	const [existing] = await db
		.select({ id: placeRelation.id, kind: placeRelation.kind })
		.from(placeRelation)
		.where(and(eq(placeRelation.userId, userId), eq(placeRelation.placeId, placeId)))
		.limit(1);

	if (existing) {
		// Clicking the same kind a second time clears it.
		if (existing.kind === kind) {
			await db.delete(placeRelation).where(eq(placeRelation.id, existing.id));
			return null;
		}
		await db.update(placeRelation).set({ kind }).where(eq(placeRelation.id, existing.id));
		return kind;
	}

	await db.insert(placeRelation).values({ userId, placeId, kind }).onConflictDoNothing();
	return kind;
}

/**
 * Legacy toggle: flips the place between "liked" and "no relation". Kept
 * so older endpoints still compile during the dislike rollout.
 */
export async function toggleLike(userId: string, placeId: string): Promise<boolean> {
	const result = await setRelation(userId, placeId, 'liked');
	return result === 'liked';
}

/** Insert any place IDs not already liked. Used to merge anonymous likes on sign-in. */
export async function mergeLikes(userId: string, placeIds: string[]): Promise<number> {
	if (placeIds.length === 0) return 0;
	const rows = placeIds.map((placeId) => ({ userId, placeId, kind: 'liked' as const }));
	const result = await db
		.insert(placeRelation)
		.values(rows)
		.onConflictDoNothing()
		.returning({ id: placeRelation.id });
	return result.length;
}
