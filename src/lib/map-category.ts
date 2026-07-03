/**
 * Map Apple's `pointOfInterestCategory` (from MapKit JS search) to our
 * category enum: eat / drink / shop / visit. Mirrors the server-side mapping
 * in maps-search.ts but runs in the browser so we can filter search results
 * inline. Apple gives a single category per place; we bucket it into one of
 * ours. Keep the two mappings in sync.
 */
export function mapAppleCategoryClient(
	poiCategory?: string
): 'eat' | 'drink' | 'shop' | 'visit' | null {
	if (!poiCategory) return null;
	const c = poiCategory.toLowerCase();
	// Drink first so "brewery"/"winery" land here rather than eat/visit.
	if (['bar', 'pub', 'brewery', 'winery', 'distillery', 'nightlife'].some((n) => c.includes(n)))
		return 'drink';
	if (
		['restaurant', 'cafe', 'coffee', 'bakery', 'fastfood', 'food', 'dessert', 'icecream'].some(
			(n) => c.includes(n)
		)
	)
		return 'eat';
	if (['store', 'shop', 'bookstore', 'clothingstore', 'market', 'mall'].some((n) => c.includes(n)))
		return 'shop';
	if (
		[
			'park',
			'museum',
			'landmark',
			'monument',
			'aquarium',
			'zoo',
			'garden',
			'beach',
			'amusement',
			'stadium',
			'theater',
			'gallery',
			'library',
			'castle',
			'fortress',
			'observatory',
			'planetarium',
			'attraction'
		].some((n) => c.includes(n))
	)
		return 'visit';
	return null;
}
