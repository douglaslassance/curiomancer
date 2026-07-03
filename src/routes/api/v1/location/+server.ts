import { error, json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { userLocation } from '$lib/server/db/schema';
import { reverseGeocode } from '$lib/server/location';
import { requireApiUser } from '$lib/server/api-auth';
import type { RequestHandler } from './$types';

/**
 * POST /api/v1/location
 *
 * Token-authenticated twin of /api/location: reverse-geocode a coordinate to a
 * city and upsert the viewer's current location. Returns the resolved city so
 * the client can render it without a second round trip.
 *
 *   body: { latitude, longitude, timezone? }
 *   returns: { city, countryCode, timezone }
 */
export const POST: RequestHandler = async ({ request }) => {
	const userId = await requireApiUser(request);

	const body = (await request.json().catch(() => null)) as {
		latitude?: unknown;
		longitude?: unknown;
		timezone?: unknown;
	} | null;

	const lat = typeof body?.latitude === 'number' ? body.latitude : NaN;
	const lng = typeof body?.longitude === 'number' ? body.longitude : NaN;
	const clientTz = typeof body?.timezone === 'string' ? body.timezone : null;

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
		userId,
		city: resolved.city,
		countryCode: resolved.countryCode,
		latitude: lat,
		longitude: lng,
		timezone: clientTz ?? resolved.timezone,
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
