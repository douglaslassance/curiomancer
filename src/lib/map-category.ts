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
export type PlaceCategory = 'eat' | 'drink' | 'shop' | 'visit';

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

export function mapAppleCategory(poiCategory?: string): PlaceCategory | null {
	if (!poiCategory) return null;
	const c = poiCategory.toLowerCase();
	if (EAT.has(c)) return 'eat';
	if (DRINK.has(c)) return 'drink';
	if (SHOP.has(c)) return 'shop';
	if (VISIT.has(c)) return 'visit';
	return null;
}
