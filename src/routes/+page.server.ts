import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { placeRelation, userLocation } from '$lib/server/db/schema';
import { getCurrentWeather, type Weather } from '$lib/server/weather';
import {
	getMatchedPeopleInCity,
	getRecommendedPlaces,
	logRecommendationImpressions,
	type MatchedPerson,
	type RecommendedPlace
} from '$lib/server/matching';
import { MATCH_THRESHOLD } from '$lib/server/similarity';
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

	// Recommendations come purely from the personalised recommender, which
	// draws only from real taste-twins (match above MATCH_THRESHOLD). A user
	// with no twins yet gets empty rails on purpose - the dashboard then nudges
	// them to Tune rather than passing off popular places as recommendations.
	// Radius-scoped (not an exact city match) so a place just across a city
	// line isn't invisible just because of an address field.
	const scope = {
		kind: 'radius' as const,
		latitude: loc.latitude,
		longitude: loc.longitude,
		radiusKm: 30
	};
	const placesFor = (category: 'eat' | 'drink' | 'shop' | 'visit') =>
		getRecommendedPlaces(userId, scope, category);

	const [weather, matchedPeople, eat, drink, shop, visit] = await Promise.all([
		getCurrentWeather(loc.latitude, loc.longitude).catch((err) => {
			console.error('Weather lookup failed:', err);
			return null as Weather | null;
		}),
		myLikeCount > 0
			? getMatchedPeopleInCity(userId, loc.city).then((people) =>
					people.filter((p) => p.score > MATCH_THRESHOLD)
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
