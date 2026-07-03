/**
 * Encodes Lucide icons as inline SVG data URIs sized for MapKit's marker
 * glyph slot. We rasterize at request time (not at build) because the
 * icons are tiny and the cost is negligible compared to caching them.
 *
 * Paths are copied verbatim from @lucide/svelte v1.16.0 to keep the look
 * consistent with the rest of the app's iconography.
 */

import type { Place } from '$lib/server/db/schema';

// Lucide source paths (24×24 viewBox, stroke-based). Keep in sync with
// `node_modules/@lucide/svelte/dist/icons/<icon>.svelte` if we ever upgrade.
const PATHS: Record<Place['category'], string[]> = {
	// utensils-crossed
	eat: [
		'm16 2-2.3 2.3a3 3 0 0 0 0 4.2l1.8 1.8a3 3 0 0 0 4.2 0L22 8',
		'M15 15 3.3 3.3a4.2 4.2 0 0 0 0 6l7.3 7.3c.7.7 2 .7 2.8 0L15 15Zm0 0 7 7',
		'm2.1 21.8 6.4-6.3',
		'm19 5-7 7'
	],
	// martini
	drink: [
		'M8 22h8',
		'M7 10h10',
		'M12 15v7',
		'M12 15a5 5 0 0 0 5-5c0-2-.5-4-2-8H9c-1.5 4-2 6-2 8a5 5 0 0 0 5 5Z'
	],
	// shopping-bag
	shop: [
		'M16 10a4 4 0 0 1-8 0',
		'M3.103 6.034h17.794',
		'M3.4 5.467a2 2 0 0 0-.4 1.2V20a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6.667a2 2 0 0 0-.4-1.2l-2-2.667A2 2 0 0 0 17 2H7a2 2 0 0 0-1.6.8z'
	],
	// landmark (parks, museums, attractions)
	visit: ['M3 22h18', 'M6 18v-7', 'M10 18v-7', 'M14 18v-7', 'M18 18v-7', 'M12 2 20 7 4 7Z']
};

/**
 * Returns a data URI of the category's Lucide icon, drawn in `stroke`.
 * MapKit overlays this on the pin and tints it white-ish on top of our
 * fill color, so passing `#fff` here is the conventional choice.
 */
export function categoryGlyphDataUri(category: Place['category'], stroke = '#fff'): string {
	// Lucide icons are drawn edge-to-edge in a 24×24 box, which makes them fill
	// the pin wall-to-wall. Pad the canvas so the glyph sits comfortably inside
	// the marker. Growing width/height with the viewBox keeps the units-to-px
	// ratio at 1:1, so the stroke weight is unchanged - only transparent margin
	// is added around the icon.
	const PAD = 5;
	const size = 24 + PAD * 2;
	const paths = PATHS[category].map((d) => `<path d="${d}"/>`).join('');
	const svg =
		`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" ` +
		`viewBox="${-PAD} ${-PAD} ${size} ${size}" ` +
		`fill="none" stroke="${stroke}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">` +
		paths +
		`</svg>`;
	return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
