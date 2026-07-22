import { json } from '@sveltejs/kit';
import { requireApiUser } from '$lib/server/api-auth';
import { getUserLocation } from '$lib/server/current-location';
import { getRelationMap } from '$lib/server/likes';
import { getSkippedExternalIds, getTuneQueue, NEGATIVE_AT_KM } from '$lib/server/tune';
import type { NearbyPlace } from '$lib/server/nearby';
import type { RequestHandler } from './$types';

/**
 * GET /api/v1/rate
 *
 * The quick-rate queue: places worth rating near the viewer, ranked by
 * proximity + taste-match + popularity (only places scoring > 0) and skip-aware.
 * Shares `getTuneQueue` with the web `/tune` load so the two can't drift on
 * which places surface or in what order.
 *
 * The difference from the web is representation only: the web returns the full
 * ranked set plus the viewer's rated ids for client-side filtering; this does
 * the "unrated" filtering server-side so the client just walks the list.
 * `radiusKm` is `NEGATIVE_AT_KM` (the distance a signal-less place stops scoring
 * above zero), matching `/tune`, so a client's Apple POI sweep stays within it.
 *
 *   returns: { center, city, radiusKm, places, knownExternalIds, skippedExternalIds }
 */
export const GET: RequestHandler = async ({ request }) => {
	const userId = await requireApiUser(request);

	const loc = await getUserLocation(userId);
	if (!loc) {
		return json({
			center: null,
			city: null,
			radiusKm: NEGATIVE_AT_KM,
			places: [] as NearbyPlace[],
			knownExternalIds: [] as string[],
			skippedExternalIds: [] as string[]
		});
	}

	const [ranked, relationMap, skippedExternalIds] = await Promise.all([
		getTuneQueue(userId, loc.latitude, loc.longitude),
		getRelationMap(userId),
		getSkippedExternalIds(userId)
	]);

	// Server-side "unrated" filter. getTuneQueue keeps rated places (the web
	// client needs them to dedupe its Apple sweep); we drop them here since the
	// native client just walks the list. Filtering preserves the ranking.
	const unrated = ranked.filter((p) => !relationMap[p.id]);

	// External ids of Apple-sourced places we already hold (from the full ranked
	// set, matching the web), so a client pulling fresh POIs can skip them.
	const knownExternalIds = ranked
		.filter((p) => p.source === 'apple' && p.externalId)
		.map((p) => p.externalId as string);

	return json({
		center: { latitude: loc.latitude, longitude: loc.longitude },
		city: loc.city,
		radiusKm: NEGATIVE_AT_KM,
		places: unrated,
		knownExternalIds,
		skippedExternalIds
	});
};
