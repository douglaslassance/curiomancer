import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { userLocation, type PlaceRelationKind } from '$lib/server/db/schema';
import { getRelationMap } from '$lib/server/likes';
import { type NearbyPlace } from '$lib/server/nearby';
import { getScoredTuneQueue, getSkippedExternalIds, NEGATIVE_AT_KM } from '$lib/server/tune';
import { isAdmin } from '$lib/server/admin';
import type { TuneBreakdown } from '$lib/tune-breakdown';
import type { PageServerLoad } from './$types';

// Quick-rate flow: hand the client the places worth rating near the viewer
// (ranked by proximity + taste match + popularity; only places scoring > 0)
// plus the ids they've already rated, so it can walk the unrated ones
// best-first. `radiusKm` is NEGATIVE_AT_KM - the distance where proximity stops
// being a positive - which is as far as a raw Apple POI (proximity-only, no
// signal) can score above zero, so the client's Apple sweep stays within it.
export const load: PageServerLoad = async ({ locals }) => {
	const empty = {
		center: null,
		city: null as string | null,
		radiusKm: NEGATIVE_AT_KM,
		places: [] as NearbyPlace[],
		knownExternalIds: [] as string[],
		skippedExternalIds: [] as string[],
		likedIds: [] as string[],
		dislikedIds: [] as string[],
		seenIds: [] as string[],
		wantToGoIds: [] as string[],
		// Admin-only "why this showed" terms, keyed by place id. Empty for
		// everyone else, so the scoring internals never reach a normal session.
		tuneBreakdowns: {} as Record<string, TuneBreakdown>,
		isAdmin: false
	};

	if (!locals.user) return { ...empty, signedIn: false as const };

	const [loc] = await db
		.select({
			latitude: userLocation.latitude,
			longitude: userLocation.longitude,
			city: userLocation.city
		})
		.from(userLocation)
		.where(eq(userLocation.userId, locals.user.id))
		.limit(1);

	if (!loc) return { ...empty, signedIn: true as const };

	// One relation lookup instead of four getPlaceIdsByKind round trips.
	const [scored, relations, skippedExternalIds] = await Promise.all([
		getScoredTuneQueue(locals.user.id, loc.latitude, loc.longitude),
		getRelationMap(locals.user.id),
		getSkippedExternalIds(locals.user.id)
	]);
	const allNearby = scored.map((s) => s.place);

	const viewerIsAdmin = isAdmin(locals.user as { role?: string });
	const tuneBreakdowns: Record<string, TuneBreakdown> = {};
	if (viewerIsAdmin) for (const s of scored) tuneBreakdowns[s.place.id] = s.breakdown;
	const idsOf = (kind: PlaceRelationKind) =>
		Object.keys(relations).filter((id) => relations[id] === kind);

	// External ids of Apple-sourced places we already have, so the client can
	// skip re-surfacing them when it pulls fresh POIs from Apple.
	const knownExternalIds = allNearby
		.filter((p) => p.source === 'apple' && p.externalId)
		.map((p) => p.externalId as string);

	return {
		center: { latitude: loc.latitude, longitude: loc.longitude },
		city: loc.city,
		// The client sweeps Apple POIs only within NEGATIVE_AT_KM - past that a
		// signal-less POI scores <= 0 and wouldn't be shown anyway.
		radiusKm: NEGATIVE_AT_KM,
		places: allNearby,
		knownExternalIds,
		// Apple POIs the viewer skipped (still in cooldown) so the sweep skips them.
		skippedExternalIds,
		likedIds: idsOf('liked'),
		dislikedIds: idsOf('disliked'),
		seenIds: idsOf('seen'),
		wantToGoIds: idsOf('want_to_go'),
		tuneBreakdowns,
		isAdmin: viewerIsAdmin,
		signedIn: true as const
	};
};
