import { error } from '@sveltejs/kit';
import { and, count, eq } from 'drizzle-orm';
import { db } from './db';
import { place, placeRelation, type Place, type PlaceRelationKind } from './db/schema';

/**
 * The "place context" the map popup renders: the place row, a bare total like
 * count, and (when a viewer is given) that viewer's own relation. Shared by the
 * web (/api/places/[id]) and native (/api/v1/places/[id]) endpoints.
 *
 * Deliberately never returns WHO liked/disliked/saw it: that named social proof
 * made it too easy to spot a specific person's taste behind a recommendation
 * and game your own likes to raise your match with them. Throws a SvelteKit
 * `error` (404) when the place doesn't exist.
 */
export async function getPlaceContext(
	placeId: string,
	viewerId?: string
): Promise<{ place: Place; likeCount: number; relation: PlaceRelationKind | null }> {
	const [row] = await db.select().from(place).where(eq(place.id, placeId)).limit(1);
	if (!row) throw error(404, 'Place not found');

	const [likeRow] = await db
		.select({ likeCount: count() })
		.from(placeRelation)
		.where(eq(placeRelation.placeId, placeId));

	let relation: PlaceRelationKind | null = null;
	if (viewerId) {
		const [mine] = await db
			.select({ kind: placeRelation.kind })
			.from(placeRelation)
			.where(and(eq(placeRelation.userId, viewerId), eq(placeRelation.placeId, placeId)))
			.limit(1);
		relation = mine?.kind ?? null;
	}

	return { place: row, likeCount: likeRow.likeCount, relation };
}
