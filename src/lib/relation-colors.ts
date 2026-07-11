import type { Kind } from './relations.svelte';

/**
 * Canonical color per rating kind. This is the single source of truth for the
 * relation palette used everywhere a rating is shown - map pins, the map
 * legend/filter chips, and the Tune rate buttons - so the colors stay
 * consistent across the site. Change a value here and it changes everywhere.
 */
export const RELATION_COLOR: Record<Kind, string> = {
	liked: '#ec4899', // pink-500
	want_to_go: '#10b981', // emerald-500
	seen: '#64748b', // slate-500
	disliked: '#ef4444' // red-500
};

/** A place the viewer hasn't rated yet: neutral pin (discovery, Tune queue). */
export const RELATION_NEUTRAL = '#9ca3af'; // gray-400

/** Surfaced because a taste-twin likes it and the viewer hasn't rated it. */
export const RELATION_RECOMMENDED = '#f59e0b'; // amber-500
