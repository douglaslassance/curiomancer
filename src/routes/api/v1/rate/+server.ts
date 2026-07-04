import { json } from '@sveltejs/kit';
import { requireApiUser } from '$lib/server/api-auth';
import { getUserLocation } from '$lib/server/current-location';
import { getPlacesNearby, MAX_RADIUS_KM } from '$lib/server/nearby';
import { getRelationMap } from '$lib/server/likes';
import type { RequestHandler } from './$types';

/**
 * GET /api/v1/rate
 *
 * The quick-rate queue: places near the viewer they have not rated yet,
 * closest first. Mirrors the /rate page load, but does the "unrated" filtering
 * server-side so the client just walks the list. Also returns the external ids
 * of Apple-sourced places we already hold, so a client pulling fresh POIs from
 * Apple can skip re-surfacing them.
 *
 *   query: ?radius=<5..20016 km, default 30>
 *   returns: { center, city, radiusKm, places, knownExternalIds }
 */
export const GET: RequestHandler = async ({ request, url }) => {
	const userId = await requireApiUser(request);

	const loc = await getUserLocation(userId);
	const radiusKm = Math.max(
		5,
		Math.min(MAX_RADIUS_KM, Number(url.searchParams.get('radius') ?? '') || 30)
	);

	if (!loc) {
		return json({ center: null, city: null, radiusKm, places: [], knownExternalIds: [] });
	}

	const [nearby, relationMap] = await Promise.all([
		getPlacesNearby(loc.latitude, loc.longitude, radiusKm),
		getRelationMap(userId)
	]);

	const unrated = nearby.filter((p) => !relationMap[p.id]);

	const knownExternalIds = nearby
		.filter((p) => p.source === 'apple' && p.externalId)
		.map((p) => p.externalId as string);

	return json({
		center: { latitude: loc.latitude, longitude: loc.longitude },
		city: loc.city,
		radiusKm,
		places: unrated,
		knownExternalIds
	});
};
