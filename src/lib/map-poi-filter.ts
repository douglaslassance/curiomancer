import { normalizePoiKey } from './map-category';

/**
 * Build a MapKit JS point-of-interest filter from a `hiddenPois` list.
 *
 * Categories resolve against `mapkit.PointOfInterestCategory` at runtime,
 * through `normalizePoiKey` on both sides, rather than through hardcoded
 * `mapkit.PointOfInterestCategory.X` constants. Three reasons: the served list
 * stays in Apple's canonical vocabulary (the same one iOS matches), a MapKit
 * version that doesn't know a category skips it instead of throwing, and
 * nothing breaks if Apple's constant casing isn't what we guessed - which is
 * unverifiable here anyway, since `mapkit` is loaded from the CDN and typed
 * `any`.
 *
 * Returns null when nothing matches or the API isn't there, which leaves the map
 * showing every POI - the behavior before this existed, so a bad list or an old
 * MapKit degrades to cluttered rather than broken.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildPoiFilter(mapkit: any, hiddenPois: string[]) {
	const categories = mapkit?.PointOfInterestCategory;
	const filter = mapkit?.PointOfInterestFilter;
	if (!categories || typeof filter?.excluding !== 'function') return null;

	const hidden = new Set(hiddenPois.map(normalizePoiKey));
	const matched = Object.keys(categories)
		.filter((name) => hidden.has(normalizePoiKey(name)))
		.map((name) => categories[name]);

	return matched.length ? filter.excluding(matched) : null;
}
