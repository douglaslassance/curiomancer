/**
 * Map Apple's `pointOfInterestCategory` (from MapKit JS search / POI discovery)
 * to our category enum: eat / drink / shop / visit. Mirrors the server-side
 * mapping in maps-search.ts; keep the two in sync.
 *
 * Apple's categories are a fixed vocabulary, so we match them exactly rather
 * than by substring. Substring matching produced false positives that broad POI
 * discovery surfaces constantly: "PublicTransport" contains "pub" (→ drink),
 * "Parking" contains "park" (→ visit), "Beauty"/"Barber" contains "bar", etc.
 * Anything not explicitly bucketed returns null and is left out.
 */
const EAT = new Set(['bakery', 'cafe', 'restaurant']);
const DRINK = new Set(['brewery', 'distillery', 'nightlife', 'winery', 'bar', 'pub', 'brewpub']);
const SHOP = new Set(['store', 'foodmarket', 'bookstore', 'clothingstore', 'mall', 'market']);
const VISIT = new Set([
	'amusementpark',
	'aquarium',
	'beach',
	'campground',
	'castle',
	'fairground',
	'fortress',
	'landmark',
	'library',
	'marina',
	'movietheater',
	'museum',
	'musicvenue',
	'nationalmonument',
	'nationalpark',
	'park',
	'planetarium',
	'stadium',
	'theater',
	'zoo'
]);

export function mapAppleCategoryClient(
	poiCategory?: string
): 'eat' | 'drink' | 'shop' | 'visit' | null {
	if (!poiCategory) return null;
	const c = poiCategory.toLowerCase();
	if (EAT.has(c)) return 'eat';
	if (DRINK.has(c)) return 'drink';
	if (SHOP.has(c)) return 'shop';
	if (VISIT.has(c)) return 'visit';
	return null;
}
