import type { PlaceCategory } from './map-category';

/**
 * Display label for a place category. The stored/internal value stays
 * 'visit' (schema, filters, API) - this only controls what the word reads
 * as in the UI, where "Experience" fits landmarks/parks/museums etc. better
 * than "Visit".
 */
const LABELS: Record<PlaceCategory, string> = {
	eat: 'Eat',
	drink: 'Drink',
	shop: 'Shop',
	visit: 'Experience',
	// Anything Apple can show that isn't one of the four the product is about -
	// a university, a hospital. Rate-able, never offered by Tune.
	other: 'Other'
};

export function categoryLabel(category: PlaceCategory): string {
	return LABELS[category];
}
