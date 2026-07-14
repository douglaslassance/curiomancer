import { error } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { db } from './db';
import { placeRelation, type PlaceRelationKind } from './db/schema';
import { getPostHogClient } from './posthog';

const VALID_KINDS = ['liked', 'disliked', 'seen', 'want_to_go'] as const satisfies PlaceRelationKind[];

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
	// Toggle semantics mean this is a read-decide-write, so run it in a
	// transaction with a row lock (`FOR UPDATE`) on the existing relation.
	// Otherwise two rapid taps on the same place can interleave read and write
	// and leave a surprising final state in the one table that must never
	// corrupt (a user's ratings).
	return db.transaction(async (tx) => {
		const [existing] = await tx
			.select({ id: placeRelation.id, kind: placeRelation.kind })
			.from(placeRelation)
			.where(and(eq(placeRelation.userId, userId), eq(placeRelation.placeId, placeId)))
			.for('update')
			.limit(1);

		if (existing) {
			// Clicking the same kind a second time clears it.
			if (existing.kind === kind) {
				await tx.delete(placeRelation).where(eq(placeRelation.id, existing.id));
				return null;
			}
			await tx.update(placeRelation).set({ kind }).where(eq(placeRelation.id, existing.id));
			return kind;
		}

		await tx.insert(placeRelation).values({ userId, placeId, kind }).onConflictDoNothing();
		return kind;
	});
}

/**
 * Set or clear the viewer's stance on a place from a raw request body, capture
 * the analytics event, and return the resulting relation. Shared by the web
 * (/api/relations) and native (/api/v1/relations) endpoints so the two can't
 * drift. Throws a SvelteKit `error` (400) on invalid input.
 */
export async function ratePlace(
	userId: string,
	rawPlaceId: unknown,
	rawKind: unknown
): Promise<{ placeId: string; kind: PlaceRelationKind | null }> {
	const placeId = typeof rawPlaceId === 'string' ? rawPlaceId : null;
	if (!placeId) throw error(400, 'placeId required.');
	if (typeof rawKind !== 'string' || !VALID_KINDS.includes(rawKind as PlaceRelationKind)) {
		throw error(400, `kind must be one of: ${VALID_KINDS.join(', ')}.`);
	}

	const kind = await setRelation(userId, placeId, rawKind as PlaceRelationKind);
	getPostHogClient()?.capture({
		distinctId: userId,
		event: 'place_rated',
		properties: { place_id: placeId, kind }
	});
	return { placeId, kind };
}

/**
 * Set the user's relation to `kind` unconditionally (upsert, no toggle).
 * Unlike setRelation, calling it twice with the same kind is idempotent - it
 * leaves the row in place rather than clearing it. Used by bulk imports where
 * a name can recur and a re-run must be safe.
 */
export async function upsertRelation(
	userId: string,
	placeId: string,
	kind: PlaceRelationKind
): Promise<void> {
	await db
		.insert(placeRelation)
		.values({ userId, placeId, kind })
		.onConflictDoUpdate({
			target: [placeRelation.userId, placeRelation.placeId],
			set: { kind }
		});
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
