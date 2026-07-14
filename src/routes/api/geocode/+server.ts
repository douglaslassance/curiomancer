import { error, json } from '@sveltejs/kit';
import { reverseGeocodeApple } from '$lib/server/maps-search';
import { rateLimit } from '$lib/server/rate-limit';
import type { RequestHandler } from './$types';

// Public proxy onto Apple's geocoder; cap per IP so it can't be looped to burn
// the Maps quota.
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_IP = 30;

/**
 * POST /api/geocode  body: { latitude, longitude }  ->  { city }
 *
 * Public reverse-geocode for the splash "Detect" button. Uses Apple Maps
 * so the returned "City, Country" label matches the autocomplete
 * suggestions in both source and format.
 */
export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	const limit = rateLimit(`geocode:ip:${getClientAddress()}`, MAX_PER_IP, WINDOW_MS);
	if (!limit.ok) throw error(429, `Too many requests. Try again in ${limit.retryAfterSec}s.`);

	const body = (await request.json().catch(() => null)) as {
		latitude?: unknown;
		longitude?: unknown;
	} | null;

	const lat = typeof body?.latitude === 'number' ? body.latitude : NaN;
	const lng = typeof body?.longitude === 'number' ? body.longitude : NaN;
	if (!isFinite(lat) || !isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
		throw error(400, 'latitude and longitude must be valid numbers');
	}

	try {
		const city = await reverseGeocodeApple(lat, lng);
		return json({ city });
	} catch (err) {
		console.error('Reverse-geocode failed:', err);
		throw error(502, 'Could not determine city from coordinates');
	}
};
