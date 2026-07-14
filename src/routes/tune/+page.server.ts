import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { userLocation, type PlaceRelationKind } from '$lib/server/db/schema';
import { getRelationMap } from '$lib/server/likes';
import { getPlacesNearby, MAX_RADIUS_KM, type NearbyPlace } from '$lib/server/nearby';
import type { PageServerLoad } from './$types';

// Quick-rate flow: hand the client every place near the viewer plus the ids
// they've already rated, so it can walk them through the unrated ones. Mirrors
// the places page loader, minus the recommendation scoring it doesn't need.
export const load: PageServerLoad = async ({ locals, url }) => {
	const empty = {
		center: null,
		city: null as string | null,
		radiusKm: 30,
		places: [] as NearbyPlace[],
		knownExternalIds: [] as string[],
		likedIds: [] as string[],
		dislikedIds: [] as string[],
		seenIds: [] as string[],
		wantToGoIds: [] as string[]
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

	const radiusKm = Math.max(
		5,
		Math.min(MAX_RADIUS_KM, Number(url.searchParams.get('radius') ?? '') || 30)
	);

	// One relation lookup instead of four getPlaceIdsByKind round trips.
	const [allNearby, relations] = await Promise.all([
		getPlacesNearby(loc.latitude, loc.longitude, radiusKm),
		getRelationMap(locals.user.id)
	]);
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
		radiusKm,
		places: allNearby,
		knownExternalIds,
		likedIds: idsOf('liked'),
		dislikedIds: idsOf('disliked'),
		seenIds: idsOf('seen'),
		wantToGoIds: idsOf('want_to_go'),
		signedIn: true as const
	};
};
