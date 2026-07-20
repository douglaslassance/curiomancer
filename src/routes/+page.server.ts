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

	// Recommendations draw first from the personalised recommender, which uses
	// only real taste-twins (match above MATCH_THRESHOLD). A user with no twins
	// yet would otherwise see empty rails, so each category falls back to the
	// most-liked places nearby (`popular_fallback`) to give a cold-start user
	// something to act on. We still nudge them to Tune (see `hasTwinRecs`) until
	// they have genuine matches. Radius-scoped (not an exact city match) so a
	// place just across a city line isn't invisible over an address field.
	const scope = {
		kind: 'radius' as const,
		latitude: loc.latitude,
		longitude: loc.longitude,
		radiusKm: 30
	};

	const [weather, matchedPeople, twinEat, twinDrink, twinShop, twinVisit] = await Promise.all([
		getCurrentWeather(loc.latitude, loc.longitude).catch((err) => {
			console.error('Weather lookup failed:', err);
			return null as Weather | null;
		}),
		myLikeCount > 0
			? getMatchedPeopleInCity(userId, loc.city).then((people) =>
					people.filter((p) => p.score > MATCH_THRESHOLD)
				)
			: Promise.resolve([] as MatchedPerson[]),
		getRecommendedPlaces(userId, scope, 'eat'),
		getRecommendedPlaces(userId, scope, 'drink'),
		getRecommendedPlaces(userId, scope, 'shop'),
		getRecommendedPlaces(userId, scope, 'visit')
	]);

	// Real twin matches anywhere means the taste engine is working for them, so
	// the Tune banner stands down (same bar as before: any twin-driven rec).
	const hasTwinRecs =
		twinEat.length > 0 || twinDrink.length > 0 || twinShop.length > 0 || twinVisit.length > 0;

	// Backfill only the empty categories with popular places, so a user with
	// twins in one category still sees a full page without diluting their real
	// matches where they exist.
	const fill = (twin: RecommendedPlace[], category: 'eat' | 'drink' | 'shop' | 'visit') =>
		twin.length > 0 ? Promise.resolve(twin) : getPopularPlaces(userId, scope, category);
	const [eat, drink, shop, visit] = await Promise.all([
		fill(twinEat, 'eat'),
		fill(twinDrink, 'drink'),
		fill(twinShop, 'shop'),
		fill(twinVisit, 'visit')
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
		hasTwinRecs,
		myLikeCount
	};
};
