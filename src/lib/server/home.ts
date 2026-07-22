import { eq } from 'drizzle-orm';
import { db } from './db';
import { placeRelation } from './db/schema';
import { getUserLocation, type CurrentLocation } from './current-location';
import { getCurrentWeather, type Weather } from './weather';
import {
	getMatchedPeopleInCity,
	getPopularPlaces,
	getRecommendedPlaces,
	logRecommendationImpressions,
	type MatchedPerson,
	type RecommendedPlace
} from './matching';
import { MATCH_THRESHOLD } from './similarity';

/** The home surface, or `{ location: null }` when the viewer has no location. */
export type Home =
	| { location: null }
	| {
			location: CurrentLocation;
			weather: Weather | null;
			matchedPeople: MatchedPerson[];
			eat: RecommendedPlace[];
			drink: RecommendedPlace[];
			shop: RecommendedPlace[];
			visit: RecommendedPlace[];
			/** Any rail carries a genuine taste-twin recommendation (vs popular fill). */
			hasTwinRecs: boolean;
			myLikeCount: number;
	  };

/**
 * Build the home surface for a user: location, weather, taste-twins, and one
 * recommended-places rail per category.
 *
 * This is the single source of truth shared by the web page load
 * (`routes/+page.server.ts`) and the native API (`routes/api/v1/home`), so the
 * two can't drift. Both surfaces must show the same twins (matched people above
 * `MATCH_THRESHOLD`, the same bar `/twins` uses) and the same rails (twin-driven
 * recommendations, backfilled with popular places per empty category so a
 * cold-start user still has something to act on).
 */
export async function buildHome(userId: string): Promise<Home> {
	const loc = await getUserLocation(userId);
	if (!loc) return { location: null };

	const myLikeCount = (
		await db
			.select({ id: placeRelation.id })
			.from(placeRelation)
			.where(eq(placeRelation.userId, userId))
	).length;

	// Radius-scoped (not an exact city match) so a place just across a city line
	// isn't invisible just because of an address field.
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
		// Only real taste-twins (score above MATCH_THRESHOLD, the bar the people
		// list and /twins use). Skipped entirely until the viewer has rated
		// something, since with no ratings there's nothing to match on.
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
	// clients can drop the "Tune" nudge and relabel rails "Recommended".
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

	return { location: loc, weather, matchedPeople, eat, drink, shop, visit, hasTwinRecs, myLikeCount };
}
