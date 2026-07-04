/**
 * Display label for a place category. The stored/internal value stays
 * 'visit' (schema, filters, API) - this only controls what the word reads
 * as in the UI, where "Experience" fits landmarks/parks/museums etc. better
 * than "Visit".
 */
const LABELS: Record<'eat' | 'drink' | 'shop' | 'visit', string> = {
	eat: 'Eat',
	drink: 'Drink',
	shop: 'Shop',
	visit: 'Experience'
};

export function categoryLabel(category: 'eat' | 'drink' | 'shop' | 'visit'): string {
	return LABELS[category];
}
