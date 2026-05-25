import { error, json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { userLocation } from '$lib/server/db/schema';
import { reverseGeocode } from '$lib/server/location';
import type { RequestHandler } from './$types';

/**
 * Body: { latitude: number, longitude: number, timezone?: string }
 *
 * Reverse-geocodes the coordinates to a city, then upserts the user's
 * current location. Returns the resolved location so the client can
 * render it immediately without re-fetching.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) throw error(401, 'Sign in to set your location.');

	const body = (await request.json().catch(() => null)) as {
		latitude?: unknown;
		longitude?: unknown;
		timezone?: unknown;
	} | null;

	const lat = typeof body?.latitude === 'number' ? body.latitude : NaN;
	const lng = typeof body?.longitude === 'number' ? body.longitude : NaN;
	const browserTz = typeof body?.timezone === 'string' ? body.timezone : null;

	if (!isFinite(lat) || !isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
		throw error(400, 'latitude and longitude must be valid numbers');
	}

	let resolved;
	try {
		resolved = await reverseGeocode(lat, lng);
	} catch (err) {
		console.error('Reverse-geocode failed:', err);
		throw error(502, 'Could not determine city from coordinates');
	}

	const row = {
		userId: locals.user.id,
		city: resolved.city,
		countryCode: resolved.countryCode,
		latitude: lat,
		longitude: lng,
		// Prefer the browser-supplied IANA timezone; fall back to our country guess.
		timezone: browserTz ?? resolved.timezone,
		updatedAt: new Date()
	};

	await db
		.insert(userLocation)
		.values(row)
		.onConflictDoUpdate({
			target: userLocation.userId,
			set: {
				city: row.city,
				countryCode: row.countryCode,
				latitude: row.latitude,
				longitude: row.longitude,
				timezone: row.timezone,
				updatedAt: row.updatedAt
			}
		});

	return json({ city: row.city, countryCode: row.countryCode, timezone: row.timezone });
};
