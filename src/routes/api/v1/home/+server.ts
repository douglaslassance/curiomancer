import { json } from '@sveltejs/kit';
import { requireApiUser } from '$lib/server/api-auth';
import { buildHome } from '$lib/server/home';
import type { RequestHandler } from './$types';

/**
 * GET /api/v1/home
 *
 * The home surface: current location, weather, matched taste-twins, and one
 * recommended-places rail per category. Shares `buildHome` with the web page
 * load so the two can't drift.
 *
 * `hasTwinRecs` tells a cold-start client whether the rails are genuine
 * twin-driven recommendations ("Recommended") or the popular-places fallback
 * ("Popular", plus a nudge to Tune). `myLikeCount` lets it tailor that copy.
 *
 *   returns: { location, weather, matchedPeople, eat, drink, shop, visit,
 *              hasTwinRecs, myLikeCount }  // or { location: null }
 */
export const GET: RequestHandler = async ({ request }) => {
	const userId = await requireApiUser(request);
	return json(await buildHome(userId));
};
