import { error } from '@sveltejs/kit';
import { and, count, eq, sql } from 'drizzle-orm';
import { db } from './db';
import { place, placeRelation, type Place, type PlaceRelationKind } from './db/schema';

/**
 * Find an existing row for an Apple place we're about to save, so we never
 * create a second row for the same real-world spot. Apple hands out DIFFERENT
 * muid formats for one place depending on the API - numeric from MapKit JS on
 * the client (Tune/map POI discovery), `I...`-prefixed from the Server API the
 * Google import uses - so matching on muid alone can't dedupe across the two
 * (this is exactly how the import created duplicate rows). We therefore fall
 * back to a canonical identity: the exact (normalized) name at the same
 * ~110m-rounded coordinates, the same key the Tune client dedupe uses.
 *
 * Returns the existing place id, or null if this really is a new place.
 */
export async function findExistingApplePlaceId(params: {
	externalId?: string | null;
	name: string;
	latitude?: number | null;
	longitude?: number | null;
}): Promise<string | null> {
	const externalId = params.externalId?.trim();
	if (externalId) {
		const [byMuid] = await db
			.select({ id: place.id })
			.from(place)
			.where(and(eq(place.source, 'apple'), eq(place.externalId, externalId)))
			.limit(1);
		if (byMuid) return byMuid.id;
	}

	const name = params.name.trim();
	const { latitude, longitude } = params;
	if (name && latitude != null && longitude != null) {
		const [byIdentity] = await db.execute<{ id: string }>(sql`
			SELECT id FROM place
			WHERE lower(btrim(name)) = lower(btrim(${name}))
			  AND latitude IS NOT NULL AND longitude IS NOT NULL
			  AND round(latitude::numeric, 3) = round(${latitude}::numeric, 3)
			  AND round(longitude::numeric, 3) = round(${longitude}::numeric, 3)
			LIMIT 1
		`);
		if (byIdentity) return byIdentity.id;
	}
	return null;
}

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
