import { error, json } from '@sveltejs/kit';
import { count, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { placeRelation, place } from '$lib/server/db/schema';
import { getPeopleWhoLikedPlace, getPeopleWhoDislikedPlace } from '$lib/server/matching';
import type { RequestHandler } from './$types';

/**
 * Returns the same "place context" the detail page renders: the place row,
 * total like count, and the list of people who liked it (ranked by Jaccard
 * to the current user). The map popup calls this when a pin is selected
 * so we don't have to ship every place's full context with the map data.
 */
export const GET: RequestHandler = async ({ params, locals }) => {
	const [row] = await db.select().from(place).where(eq(place.id, params.id)).limit(1);
	if (!row) throw error(404, 'Place not found');

	const [{ likeCount }] = await db
		.select({ likeCount: count() })
		.from(placeRelation)
		.where(eq(placeRelation.placeId, params.id));

	const [likers, dislikers] = await Promise.all([
		getPeopleWhoLikedPlace(locals.user?.id ?? null, params.id),
		getPeopleWhoDislikedPlace(locals.user?.id ?? null, params.id)
	]);

	return json({ place: row, likeCount, likers, dislikers });
};
