import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { placeRelation, userLocation } from '$lib/server/db/schema';
import { getCurrentWeather, type Weather } from '$lib/server/weather';
import {
	getMatchedPeopleInCity,
	getPopularPlaces,
	getRecommendedPlaces,
	logRecommendationImpressions,
	type MatchedPerson,
	type RecommendedPlace
} from '$lib/server/matching';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		return { signedIn: false as const };
	}

	const [loc] = await db
		.select()
		.from(userLocation)
		.where(eq(userLocation.userId, locals.user.id))
		.limit(1);

	if (!loc) {
		return { signedIn: true as const, location: null };
	}

	const userId = locals.user.id;
	const myLikeCount = (
		await db
			.select({ id: placeRelation.id })
			.from(placeRelation)
			.where(eq(placeRelation.userId, userId))
	).length;

	// Try the personalised recommender first - it pulls from algorithmic
	// taste-twins. If there's no twin signal yet (cold-start user with no
	// likes), fall back to raw popularity so the dashboard never renders
	// empty rails.
	// Radius-scoped (not an exact city match) so a place just across a city
	// line isn't invisible just because of an address field.
	const scope = {
		kind: 'radius' as const,
		latitude: loc.latitude,
		longitude: loc.longitude,
		radiusKm: 30
	};
	const placesFor = async (category: 'eat' | 'drink' | 'shop' | 'visit') => {
		const recommended = await getRecommendedPlaces(userId, scope, category);
		if (recommended.length > 0) return recommended;
		return getPopularPlaces(userId, scope, category);
	};

	const [weather, matchedPeople, eat, drink, shop, visit] = await Promise.all([
		getCurrentWeather(loc.latitude, loc.longitude).catch((err) => {
			console.error('Weather lookup failed:', err);
			return null as Weather | null;
		}),
		myLikeCount > 0
			? getMatchedPeopleInCity(userId, loc.city).then((people) =>
					people.filter((p) => p.score > 0.5)
				)
			: Promise.resolve([] as MatchedPerson[]),
		placesFor('eat'),
		placesFor('drink'),
		placesFor('shop'),
		placesFor('visit')
	]);

	await logRecommendationImpressions(userId, [...eat, ...drink, ...shop, ...visit]);

	return {
		signedIn: true as const,
		location: loc,
		weather,
		matchedPeople,
		eat: eat as RecommendedPlace[],
		drink: drink as RecommendedPlace[],
		shop: shop as RecommendedPlace[],
		visit: visit as RecommendedPlace[],
		myLikeCount
	};
};
