import { error, json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { waitlist } from '$lib/server/db/schema';
import type { RequestHandler } from './$types';

/**
 * POST /api/waitlist  body: { email, city }
 *
 * Public waitlist signup from the splash. Email and city are required and
 * submitted together in one call - the city is either typed or filled by
 * the "Detect" button. Joining again updates the city.
 */
export const POST: RequestHandler = async ({ request }) => {
	const body = (await request.json().catch(() => null)) as {
		email?: unknown;
		city?: unknown;
	} | null;

	const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
	if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
		throw error(400, 'Enter a valid email address.');
	}

	const city = typeof body?.city === 'string' ? body.city.trim() : '';
	if (!city) {
		throw error(400, 'Tell us your city.');
	}

	await db
		.insert(waitlist)
		.values({ email, city })
		.onConflictDoUpdate({ target: waitlist.email, set: { city } });

	return json({ ok: true });
};
