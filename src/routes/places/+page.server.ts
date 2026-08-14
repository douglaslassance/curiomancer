import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { userLocation, type PlaceRelationKind } from '$lib/server/db/schema';
import { getRelationMap } from '$lib/server/likes';
import { getMappablePlaces } from '$lib/server/places';
import { getRecommendedScores } from '$lib/server/recommended-scores';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	// Center the map on the user's current location if they have one.
	let center = { latitude: 34.0522, longitude: -118.2437 };
	let likedIds: string[] = [];
	let wantToGoIds: string[] = [];
	let dislikedIds: string[] = [];
	let seenIds: string[] = [];
	const recommendedScores: Record<string, number> = {};

	if (locals.user) {
		const [loc] = await db
			.select({
				latitude: userLocation.latitude,
				longitude: userLocation.longitude,
				city: userLocation.city
			})
			.from(userLocation)
			.where(eq(userLocation.userId, locals.user.id))
			.limit(1);
		if (loc) center = { latitude: loc.latitude, longitude: loc.longitude };

		// One relation lookup (getRelationMap) instead of four getPlaceIdsByKind
		// round trips, so the /places relation data comes from the SAME query as
		// GET /api/v1/places (which also reads getRelationMap) and can't drift.
		const [relations, recs] = await Promise.all([
			getRelationMap(locals.user.id),
			getRecommendedScores(locals.user.id, loc?.city)
		]);
		Object.assign(recommendedScores, recs);
		const idsOf = (kind: PlaceRelationKind) =>
			Object.keys(relations).filter((id) => relations[id] === kind);
		likedIds = idsOf('liked');
		dislikedIds = idsOf('disliked');
		seenIds = idsOf('seen');
		wantToGoIds = idsOf('want_to_go');
	}

	// All places with coords. Seen and disliked are no longer filtered out -
	// the map's filter chips control which relation categories are shown.
	const places = await getMappablePlaces();

	return { places, center, likedIds, wantToGoIds, dislikedIds, seenIds, recommendedScores };
};
