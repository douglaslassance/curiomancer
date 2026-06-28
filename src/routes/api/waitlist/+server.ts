import { error, json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { waitlist } from '$lib/server/db/schema';
import { reverseGeocode } from '$lib/server/location';
import type { RequestHandler } from './$types';

/**
 * POST /api/waitlist  body: { email, latitude?, longitude? }
 *
 * Public waitlist signup from the splash. Email is required; coordinates
 * are optional and best-effort - if present we reverse-geocode to a city
 * to help with geographic batching, but a failure there never blocks the
 * signup. Joining twice is a no-op (unique email).
 */
export const POST: RequestHandler = async ({ request }) => {
	const body = (await request.json().catch(() => null)) as {
		email?: unknown;
		latitude?: unknown;
		longitude?: unknown;
	} | null;

	const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
	if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
		throw error(400, 'Enter a valid email address.');
	}

	let city: string | null = null;
	const lat = typeof body?.latitude === 'number' ? body.latitude : NaN;
	const lng = typeof body?.longitude === 'number' ? body.longitude : NaN;
	if (isFinite(lat) && isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
		try {
			city = (await reverseGeocode(lat, lng)).city;
		} catch (err) {
			// Non-fatal: keep the email, drop the city.
			console.error('Waitlist reverse-geocode failed:', err);
		}
	}

	await db.insert(waitlist).values({ email, city }).onConflictDoNothing();
	return json({ ok: true });
};
