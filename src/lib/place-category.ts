import type { Component } from 'svelte';
import { Landmark, MapPin, Martini, ShoppingBag, UtensilsCrossed } from '@lucide/svelte';
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

/**
 * The glyph for a category, matching the one its map pin carries (see
 * map-glyphs.ts, which draws the same shapes as raw path data because a pin is
 * an image, not a component). Kept here beside the labels so every surface
 * showing a category can't drift on which icon means what.
 */
const ICONS: Record<PlaceCategory, Component> = {
	eat: UtensilsCrossed,
	drink: Martini,
	shop: ShoppingBag,
	visit: Landmark,
	other: MapPin
};

export function categoryIcon(category: PlaceCategory): Component {
	return ICONS[category];
}
