import { json } from '@sveltejs/kit';
import { autocompletePlaces } from '$lib/server/maps-search';
import type { RequestHandler } from './$types';

/**
 * GET /api/place-autocomplete?q=...  ->  { results: [{ title, subtitle }] }
 *
 * Public, proxies Apple's searchAutocomplete so the splash city field can
 * suggest places without loading the MapKit JS SDK on the landing page.
 * Returns an empty list (never an error page) on short queries or upstream
 * hiccups, since this is a best-effort enhancement.
 */
export const GET: RequestHandler = async ({ url }) => {
	const q = url.searchParams.get('q')?.trim() ?? '';
	if (q.length < 2) return json({ results: [] });

	try {
		const results = await autocompletePlaces(q);
		return json({ results: results.slice(0, 6) });
	} catch (err) {
		console.error('Place autocomplete failed:', err);
		return json({ results: [] });
	}
};
