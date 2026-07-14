import { json } from '@sveltejs/kit';
import { getPlaceContext } from '$lib/server/places';
import type { RequestHandler } from './$types';

/**
 * Returns the "place context" the map popup renders: the place row and a
 * bare total like count. Deliberately doesn't return WHO liked/disliked/saw
 * it - that named social proof made it too easy to spot a specific person's
 * taste behind a recommendation and game your own likes to raise your match
 * with them.
 */
export const GET: RequestHandler = async ({ params }) => {
	const { place, likeCount } = await getPlaceContext(params.id);
	return json({ place, likeCount });
};
