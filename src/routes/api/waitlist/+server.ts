import { error, json } from '@sveltejs/kit';
import { sendWaitlistConfirmationEmail } from '$lib/server/email';
import { joinWaitlist } from '$lib/server/waitlist';
import { rateLimit } from '$lib/server/rate-limit';
import type { RequestHandler } from './$types';

// Public and it both sends an email and hits Apple's geocoder, so cap per IP.
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_IP = 5;

/**
 * POST /api/waitlist  body: { email, city }
 *
 * Public waitlist signup from the splash. Email and city are required and
 * submitted together in one call - the city is either typed or filled by
 * the "Detect" button. Joining again updates the city.
 */
export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	const limit = rateLimit(`waitlist:ip:${getClientAddress()}`, MAX_PER_IP, WINDOW_MS);
	if (!limit.ok) throw error(429, `Too many requests. Try again in ${limit.retryAfterSec}s.`);

	const body = (await request.json().catch(() => null)) as {
		email?: unknown;
		city?: unknown;
	} | null;

	const result = await joinWaitlist(body?.email, body?.city);
	if (!result.ok) throw error(400, result.message);

	// Best-effort: the waitlist entry is already saved, so a delivery hiccup
	// here shouldn't turn into a 500 for the visitor.
	try {
		await sendWaitlistConfirmationEmail(result.email);
	} catch (err) {
		console.error('Waitlist confirmation email failed:', err);
	}

	return json({ ok: true });
};
