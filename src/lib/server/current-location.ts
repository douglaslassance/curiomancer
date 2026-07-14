import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from './db';
import { userLocation } from './db/schema';
import { reverseGeocode } from './location';

export type CurrentLocation = {
	latitude: number;
	longitude: number;
	city: string;
	countryCode: string | null;
	timezone: string | null;
};

/**
 * The user's current location row, or null if they have not set one yet.
 * The page loads inline this query; the /api/v1 routes share it here.
 */
export async function getUserLocation(userId: string): Promise<CurrentLocation | null> {
	const [loc] = await db
		.select({
			latitude: userLocation.latitude,
			longitude: userLocation.longitude,
			city: userLocation.city,
			countryCode: userLocation.countryCode,
			timezone: userLocation.timezone
		})
		.from(userLocation)
		.where(eq(userLocation.userId, userId))
		.limit(1);
	return loc ?? null;
}

/**
 * Validate a coordinate, reverse-geocode it to a city, and upsert the user's
 * current location. Shared by the web (/api/location) and native
 * (/api/v1/location) endpoints so the two can't drift. Throws a SvelteKit
 * `error` (400/502) the route handler can propagate as-is. Prefers the
 * caller-supplied IANA timezone, falling back to the geocode's country guess.
 */
export async function upsertUserLocation(
	userId: string,
	rawLat: unknown,
	rawLng: unknown,
	rawTimezone: unknown
): Promise<{ city: string; countryCode: string | null; timezone: string | null }> {
	const lat = typeof rawLat === 'number' ? rawLat : NaN;
	const lng = typeof rawLng === 'number' ? rawLng : NaN;
	const clientTz = typeof rawTimezone === 'string' ? rawTimezone : null;

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

	return { city: row.city, countryCode: row.countryCode, timezone: row.timezone };
}
