import { json } from '@sveltejs/kit';
import { getPlaceContext } from '$lib/server/places';
import { getRecommendationBreakdown } from '$lib/server/matching';
import { isAdmin } from '$lib/server/admin';
import type { RequestHandler } from './$types';

/**
 * Returns the "place context" the map popup renders: the place row, a bare
 * total like count, and how strongly the place is recommended to the viewer.
 * Deliberately doesn't return WHO liked/disliked/saw it - that named social
 * proof made it too easy to spot a specific person's taste behind a
 * recommendation and game your own likes to raise your match with them.
 *
 * The score splits along that same line. `recommendationScore` is a bare number
 * with nobody's name attached, so every signed-in viewer gets it, exactly like
 * the like count. The full `recommendation` breakdown names the twins behind
 * it, so it is computed for admins only. Both come from one query.
 */
export const GET: RequestHandler = async ({ params, locals }) => {
	const { place, likeCount } = await getPlaceContext(params.id);
	const breakdown = locals.user
		? await getRecommendationBreakdown(locals.user.id, params.id)
		: null;
	return json({
		place,
		likeCount,
		recommendationScore: breakdown?.score ?? null,
		recommendation: locals.user && isAdmin(locals.user) ? breakdown : null
	});
};
