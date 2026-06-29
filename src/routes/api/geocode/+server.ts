import { error, json } from '@sveltejs/kit';
import { reverseGeocodeApple } from '$lib/server/maps-search';
import type { RequestHandler } from './$types';

/**
 * POST /api/geocode  body: { latitude, longitude }  ->  { city }
 *
 * Public reverse-geocode for the splash "Detect" button. Uses Apple Maps
 * so the returned "City, Country" label matches the autocomplete
 * suggestions in both source and format.
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
		const city = await reverseGeocodeApple(lat, lng);
		return json({ city });
	} catch (err) {
		console.error('Reverse-geocode failed:', err);
		throw error(502, 'Could not determine city from coordinates');
	}
};
