import { json } from '@sveltejs/kit';
import { autocompletePlaces } from '$lib/server/maps-search';
import { rateLimit } from '$lib/server/rate-limit';
import type { RequestHandler } from './$types';

// Typed-as-you-go, so the cap is generous; it only exists to stop a script from
// hammering Apple's autocomplete. Over the limit we return an empty list, same
// as any other upstream hiccup, so the field degrades quietly.
const WINDOW_MS = 60 * 1000;
const MAX_PER_IP = 60;

/**
 * GET /api/place-autocomplete?q=...  ->  { results: [{ title, subtitle }] }
 *
 * Public, proxies Apple's searchAutocomplete so the splash city field can
 * suggest places without loading the MapKit JS SDK on the landing page.
 * Returns an empty list (never an error page) on short queries or upstream
 * hiccups, since this is a best-effort enhancement.
 */
export const GET: RequestHandler = async ({ url, getClientAddress }) => {
	if (!rateLimit(`autocomplete:ip:${getClientAddress()}`, MAX_PER_IP, WINDOW_MS).ok) {
		return json({ results: [] });
	}

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
