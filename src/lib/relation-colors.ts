import type { Kind } from './relations.svelte';

/**
 * Canonical color per rating kind. This is the single source of truth for the
 * relation palette used everywhere a rating is shown - map pins, the map
 * legend/filter chips, and the Tune rate buttons - so the colors stay
 * consistent across the site. Change a value here and it changes everywhere.
 */
export const RELATION_COLOR: Record<Kind, string> = {
	liked: '#ec4899', // pink-500
	want_to_go: '#236d4d', // Curiomancer green (brand --primary, oklch(0.48 0.09 161))
	seen: '#3b82f6', // blue-500
	disliked: '#ef4444' // red-500
};

/** A place the viewer hasn't rated yet: neutral pin (discovery, Tune queue). */
export const RELATION_NEUTRAL = '#9ca3af'; // gray-400

/** Surfaced because a taste-twin likes it and the viewer hasn't rated it. */
export const RELATION_RECOMMENDED = '#6b7280'; // mid grey (gray-500)
