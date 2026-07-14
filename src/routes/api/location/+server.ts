import { error, json } from '@sveltejs/kit';
import { upsertUserLocation } from '$lib/server/current-location';
import { getPostHogClient } from '$lib/server/posthog';
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

	const result = await upsertUserLocation(
		locals.user.id,
		body?.latitude,
		body?.longitude,
		body?.timezone
	);

	getPostHogClient()?.capture({
		distinctId: locals.user.id,
		event: 'location_updated',
		properties: { city: result.city, country_code: result.countryCode }
	});

	return json(result);
};
