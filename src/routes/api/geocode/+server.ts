import { error, json } from '@sveltejs/kit';
import { reverseGeocode } from '$lib/server/location';
import type { RequestHandler } from './$types';

/**
 * POST /api/geocode  body: { latitude, longitude }  ->  { city, countryCode }
 *
 * Public reverse-geocode used by the splash "Detect" button so a visitor
 * can auto-fill their city. Reverse-geocoding runs server-side because
 * Nominatim requires an identifying User-Agent.
 */
export const POST: RequestHandler = async ({ request }) => {
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
		const resolved = await reverseGeocode(lat, lng);
		return json({ city: resolved.city, countryCode: resolved.countryCode });
	} catch (err) {
		console.error('Reverse-geocode failed:', err);
		throw error(502, 'Could not determine city from coordinates');
	}
};
