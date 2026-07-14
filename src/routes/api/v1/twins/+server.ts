import { json } from '@sveltejs/kit';
import { requireApiUser } from '$lib/server/api-auth';
import { getUserLocation } from '$lib/server/current-location';
import { getPeopleNearby, MAX_RADIUS_KM } from '$lib/server/nearby';
import { MATCH_THRESHOLD } from '$lib/server/similarity';
import type { RequestHandler } from './$types';

/**
 * GET /api/v1/twins
 *
 * Taste-twins: people near the viewer whose cosine similarity clears
 * MATCH_THRESHOLD.
 * Mirrors the /people page load. Returns an empty list (not an error) when
 * the viewer has no saved location, so the client can prompt for one.
 *
 *   query: ?radius=<5..20016 km, default 30>
 *   returns: { center, radiusKm, people }
 */
export const GET: RequestHandler = async ({ request, url }) => {
	const userId = await requireApiUser(request);

	const loc = await getUserLocation(userId);
	const radiusKm = Math.max(
		5,
		Math.min(MAX_RADIUS_KM, Number(url.searchParams.get('radius') ?? '') || 30)
	);

	if (!loc) {
		return json({ center: null, radiusKm, people: [] });
	}

	const people = (await getPeopleNearby(loc.latitude, loc.longitude, radiusKm, userId)).filter(
		(p) => p.score !== null && p.score > MATCH_THRESHOLD
	);

	return json({
		center: { latitude: loc.latitude, longitude: loc.longitude },
		radiusKm,
		people
	});
};
