/**
 * Map Apple's `pointOfInterestCategory` to our category enum: eat / drink /
 * shop / visit. Single source of truth shared by the client (MapKit JS search
 * and POI discovery, via map-view / map-search / tune) and the server (import
 * and seed, via maps-search.ts) so the two can never drift apart.
 *
 * Apple's categories are a fixed vocabulary, so we match them exactly rather
 * than by substring. Substring matching produced false positives that broad POI
 * discovery surfaces constantly: "PublicTransport" contains "pub" (→ drink),
 * "Parking" contains "park" (→ visit), "Beauty"/"Barber" contains "bar", etc.
 * Anything not explicitly bucketed returns null and is left out.
 *
 * The sets are the union of what MapKit JS and the Apple Server API each return.
 * The extra Server-API synonyms (coffeeshop, grocerystore, gallery, ...) are
 * harmless on the client, which simply never encounters them.
 */
export type PlaceCategory = 'eat' | 'drink' | 'shop' | 'visit' | 'other';

/**
 * The categories the product is *about*. Tune only ever offers these, and the
 * sets below are what sorts a POI into one.
 *
 * `other` is deliberately not here. You can rate anything Apple can show - a
 * university, a hospital, a park - and those land in `other`, which keeps them
 * off the Tune queue while still letting them onto your map.
 */
export const CURATED_CATEGORIES = ['eat', 'drink', 'shop', 'visit'] as const;
export type CuratedCategory = (typeof CURATED_CATEGORIES)[number];

const EAT = new Set(['bakery', 'cafe', 'restaurant', 'coffeeshop', 'coffee', 'dessert']);
const DRINK = new Set(['brewery', 'distillery', 'nightlife', 'winery', 'bar', 'pub', 'brewpub']);
const SHOP = new Set([
	'store',
	'foodmarket',
	'bookstore',
	'clothingstore',
	'mall',
	'market',
	'grocerystore'
]);
// Deliberately narrow: the product is about places you go and spend time in
// (eat / drink / shop), plus venues you actually visit and would recommend.
// We keep cultural + entertainment venues (museum, theater, zoo, ...) but drop
// open geographic features (park, beach, garden, national park, marina) and
// passive/institutional POIs (landmark, monument, library, school), which were
// surfacing things users can't act on (a friend got recommended an
// architecture school - Apple tags such buildings `landmark`). Anything not
// listed here returns null and is left out of discovery, import, and seed.
const VISIT = new Set([
	'museum',
	'gallery',
	'theater',
	'movietheater',
	'musicvenue',
	'stadium',
	'zoo',
	'aquarium',
	'planetarium',
	'observatory',
	'amusementpark'
]);

/**
 * Apple POI categories the map hides outright.
 *
 * Empty today: every point of interest Apple draws is shown. The list stays
 * wired through `/api/v1/map-config` because that is exactly the kind of call
 * that shouldn't need three client releases to reverse - adding an entry here
 * hides it on the web, iOS, and Android on their next map load.
 *
 * Written in Apple's canonical form rather than our normalized one. It's the
 * only form a client can turn back into a real SDK category without naming
 * symbols (iOS does `MKPointOfInterestCategory(rawValue:)` straight off these),
 * and every client already normalizes with `normalizePoiKey` on the way in, so
 * matching costs nothing.
 */
const HIDDEN_POIS: string[] = [];

/**
 * Reduce any spelling of an Apple POI category to our comparison key.
 *
 * The same category reaches us as `MKPOICategoryGasStation` (MapKit, and the
 * canonical form we serve) or `GasStation` (MapKit JS), so strip the prefix and
 * lowercase. Every client implements this same two-step, which is what lets one
 * served vocabulary drive all three maps.
 */
export function normalizePoiKey(key: string): string {
	return key.replace(/^MKPOICategory/i, '').toLowerCase();
}

/**
 * The whole Apple-category vocabulary as plain data, for `/api/v1/map-config`.
 *
 * The buckets are our normalized keys (`restaurant`); `hiddenPois` is Apple's
 * canonical form (`MKPOICategoryATM`). Both sides of every comparison run
 * through `normalizePoiKey` on the client, so a category Apple adds is a change
 * here and nowhere else - no App Store or Play release to make the maps agree.
 */
export function mapCategoryVocabulary() {
	return {
		categories: {
			eat: [...EAT],
			drink: [...DRINK],
			shop: [...SHOP],
			visit: [...VISIT]
		},
		hiddenPois: [...HIDDEN_POIS]
	};
}

/**
 * The category to *store* a place under. Never null: anything Apple can show is
 * rate-able, and whatever we can't bucket lands in `other`.
 *
 * Use this on the rating path. Use `mapAppleCategory` on the discovery path
 * (Tune, seed, import), where an unbucketed POI should be skipped rather than
 * offered up as something to rate.
 */
export function placeCategoryFor(poiCategory?: string): PlaceCategory {
	return mapAppleCategory(poiCategory) ?? 'other';
}

/**
 * Bucket a POI into one of the curated categories, or null when it isn't one of
 * them. Null means "not something Tune should offer", not "not rate-able".
 */
export function mapAppleCategory(poiCategory?: string): CuratedCategory | null {
	if (!poiCategory) return null;
	const c = normalizePoiKey(poiCategory);
	if (EAT.has(c)) return 'eat';
	if (DRINK.has(c)) return 'drink';
	if (SHOP.has(c)) return 'shop';
	if (VISIT.has(c)) return 'visit';
	return null;
}
