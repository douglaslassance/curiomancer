import { error, json } from '@sveltejs/kit';
import { joinWaitlist } from '$lib/server/waitlist';
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

	const result = await joinWaitlist(body?.email, body?.city);
	if (!result.ok) throw error(400, result.message);

	return json({ ok: true });
};
