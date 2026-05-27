import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { userLocation } from '$lib/server/db/schema';
import { getPlaceIdsByKind } from '$lib/server/likes';
import { getPlacesNearby, type NearbyPlace } from '$lib/server/nearby';
import { getRecommendedPlaces } from '$lib/server/matching';
import type { PageServerLoad } from './$types';

type Filter = 'all' | 'liked' | 'disliked' | 'seen' | 'recommended';

function parseFilter(value: string | null): Filter {
	return value === 'liked' || value === 'disliked' || value === 'seen' || value === 'recommended'
		? value
		: 'all';
}

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) {
		return {
			center: null,
			radiusKm: 30,
			filter: 'all' as Filter,
			places: [] as NearbyPlace[],
			likedIds: [] as string[],
			dislikedIds: [] as string[],
			seenIds: [] as string[],
			recommendedScores: {} as Record<string, number>,
			signedIn: false as const
		};
	}

	const [loc] = await db
		.select({
			latitude: userLocation.latitude,
			longitude: userLocation.longitude,
			city: userLocation.city
		})
		.from(userLocation)
		.where(eq(userLocation.userId, locals.user.id))
		.limit(1);

	if (!loc) {
		return {
			center: null,
			radiusKm: 30,
			filter: 'all' as Filter,
			places: [] as NearbyPlace[],
			likedIds: [] as string[],
			dislikedIds: [] as string[],
			seenIds: [] as string[],
			recommendedScores: {} as Record<string, number>,
			signedIn: true as const
		};
	}

	const radiusKm = Math.max(1, Math.min(500, Number(url.searchParams.get('radius') ?? '') || 30));
	const filter = parseFilter(url.searchParams.get('filter'));

	const [allNearby, liked, disliked, seen, recsByCategory] = await Promise.all([
		getPlacesNearby(loc.latitude, loc.longitude, radiusKm),
		getPlaceIdsByKind(locals.user.id, 'liked'),
		getPlaceIdsByKind(locals.user.id, 'disliked'),
		getPlaceIdsByKind(locals.user.id, 'seen'),
		// Recommendation scores are computed per-category by the existing
		// matching layer. Flatten into a single map placeId → score.
		Promise.all([
			getRecommendedPlaces(locals.user.id, loc.city, 'restaurant', 100),
			getRecommendedPlaces(locals.user.id, loc.city, 'bar', 100),
			getRecommendedPlaces(locals.user.id, loc.city, 'shop', 100)
		])
	]);

	const recommendedScores: Record<string, number> = {};
	for (const set of recsByCategory) {
		for (const rec of set) recommendedScores[rec.id] = rec.score;
	}

	return {
		center: { latitude: loc.latitude, longitude: loc.longitude },
		radiusKm,
		filter,
		places: allNearby,
		likedIds: [...liked],
		dislikedIds: [...disliked],
		seenIds: [...seen],
		recommendedScores,
		signedIn: true as const
	};
};
