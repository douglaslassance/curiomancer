import { json } from '@sveltejs/kit';
import { getPlaceContext } from '$lib/server/places';
import { requireApiUser } from '$lib/server/api-auth';
import type { RequestHandler } from './$types';

/**
 * GET /api/v1/places/:id
 *
 * A single place with a bare like count and the viewer's own relation.
 * Deliberately doesn't return WHO liked it - that named social proof made it
 * too easy to spot a specific person's taste behind a recommendation and
 * game your own likes to raise your match with them.
 *
 *   returns: { place, likeCount, relation }
 */
export const GET: RequestHandler = async ({ request, params }) => {
	const userId = await requireApiUser(request);
	return json(await getPlaceContext(params.id, userId));
};
