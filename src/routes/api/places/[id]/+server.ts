import { error, json } from '@sveltejs/kit';
import { count, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { placeRelation, place } from '$lib/server/db/schema';
import type { RequestHandler } from './$types';

/**
 * Returns the "place context" the map popup renders: the place row and a
 * bare total like count. Deliberately doesn't return WHO liked/disliked/saw
 * it - that named social proof made it too easy to spot a specific person's
 * taste behind a recommendation and game your own likes to raise your match
 * with them.
 */
export const GET: RequestHandler = async ({ params }) => {
	const [row] = await db.select().from(place).where(eq(place.id, params.id)).limit(1);
	if (!row) throw error(404, 'Place not found');

	const [{ likeCount }] = await db
		.select({ likeCount: count() })
		.from(placeRelation)
		.where(eq(placeRelation.placeId, params.id));

	return json({ place: row, likeCount });
};
