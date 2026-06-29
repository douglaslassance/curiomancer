import { error, json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { waitlist } from '$lib/server/db/schema';
import { reverseGeocode } from '$lib/server/location';
import type { RequestHandler } from './$types';

/**
 * POST /api/waitlist  body: { email, latitude?, longitude? }
 *
 * Public waitlist signup from the splash. Email is required and saved
 * immediately. Coordinates are optional and arrive in a separate, later
 * call (so closing the tab during the geolocation prompt can't lose the
 * email): if present we reverse-geocode to a city and fill it in on the
 * existing row. Joining twice is harmless.
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

	if (city) {
		// Location enrichment: insert or fill the city on an existing row.
		await db
			.insert(waitlist)
			.values({ email, city })
			.onConflictDoUpdate({ target: waitlist.email, set: { city } });
	} else {
		// Plain email capture: never clobber a city we may already have.
		await db.insert(waitlist).values({ email }).onConflictDoNothing();
	}

	return json({ ok: true });
};
