import { json } from '@sveltejs/kit';
import { mapCategoryVocabulary } from '$lib/map-category';
import type { RequestHandler } from './$types';

/**
 * GET /api/v1/map-config
 *
 * The Apple-category vocabulary the map runs on, as plain data: which POI
 * categories bucket into eat / drink / shop / visit, and which ones the map
 * hides outright. `map-category.ts` stays the source of truth (the server still
 * imports it directly for import and seed); this only exposes it.
 *
 * It exists so the rule that decides whether tapping a POI ends in a rating or
 * a dead end lives in one place instead of three hand-kept copies. Apple's
 * vocabulary grows with each SDK, and without this every addition means an
 * App Store and a Play release before the three maps agree again.
 *
 * Keys are lowercase and bare (`restaurant`, not `MKPOICategoryRestaurant`),
 * which is the form all three clients already normalize to.
 *
 * Unauthenticated on purpose: it's static, non-sensitive vocabulary, and the
 * map should be able to configure itself without waiting on a token. Clients
 * keep their own copy as a fallback, so an unreachable server degrades to
 * today's behavior rather than an unconfigured map.
 */
export const GET: RequestHandler = async ({ setHeaders }) => {
	// Changes only when Apple's vocabulary does, so it caches well. A short
	// max-age with a long stale window keeps clients off the origin without
	// stranding them on an old list for a whole day.
	setHeaders({ 'cache-control': 'public, max-age=3600, stale-while-revalidate=86400' });

	return json(mapCategoryVocabulary());
};
