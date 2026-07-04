import { eq } from 'drizzle-orm';
import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { placeRelation } from '$lib/server/db/schema';
import { requireApiUser } from '$lib/server/api-auth';
import { getUserLocation } from '$lib/server/current-location';
import { getCurrentWeather, type Weather } from '$lib/server/weather';
import {
	getMatchedPeopleInCity,
	getPopularPlaces,
	getRecommendedPlaces,
	logRecommendationImpressions,
	type MatchedPerson
} from '$lib/server/matching';
import type { RequestHandler } from './$types';

/**
 * GET /api/v1/dashboard
 *
 * The home surface: current location, weather, matched people, and one
 * recommended-places rail per category. Mirrors the root page load, including
 * its cold-start fallback from personalised recommendations to raw popularity
 * so the rails never come back empty.
 *
 *   returns: { location, weather, matchedPeople, eat, drink, shop, visit, myLikeCount }
 */
export const GET: RequestHandler = async ({ request }) => {
	const userId = await requireApiUser(request);

	const loc = await getUserLocation(userId);
	if (!loc) {
		return json({ location: null });
	}

	const myLikeCount = (
		await db
			.select({ id: placeRelation.id })
			.from(placeRelation)
			.where(eq(placeRelation.userId, userId))
	).length;

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
			? getMatchedPeopleInCity(userId, loc.city)
			: Promise.resolve([] as MatchedPerson[]),
		placesFor('eat'),
		placesFor('drink'),
		placesFor('shop'),
		placesFor('visit')
	]);

	await logRecommendationImpressions(userId, [...eat, ...drink, ...shop, ...visit]);

	return json({ location: loc, weather, matchedPeople, eat, drink, shop, visit, myLikeCount });
};
