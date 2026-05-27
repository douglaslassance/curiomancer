import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { placeRelation, userLocation } from '$lib/server/db/schema';
import { getCurrentWeather, type Weather } from '$lib/server/weather';
import {
	getMatchedPeopleInCity,
	getPopularPlaces,
	getRecommendedPlaces,
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

	const placesFor = (category: 'restaurant' | 'bar' | 'shop') =>
		myLikeCount > 0
			? getRecommendedPlaces(userId, loc.city, category)
			: getPopularPlaces(loc.city, category);

	const [weather, matchedPeople, restaurants, bars, shops] = await Promise.all([
		getCurrentWeather(loc.latitude, loc.longitude).catch((err) => {
			console.error('Weather lookup failed:', err);
			return null as Weather | null;
		}),
		myLikeCount > 0
			? getMatchedPeopleInCity(userId, loc.city)
			: Promise.resolve([] as MatchedPerson[]),
		placesFor('restaurant'),
		placesFor('bar'),
		placesFor('shop')
	]);

	return {
		signedIn: true as const,
		location: loc,
		weather,
		matchedPeople,
		restaurants: restaurants as RecommendedPlace[],
		bars: bars as RecommendedPlace[],
		shops: shops as RecommendedPlace[],
		myLikeCount
	};
};
