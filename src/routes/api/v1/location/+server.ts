import { json } from '@sveltejs/kit';
import { upsertUserLocation } from '$lib/server/current-location';
import { requireApiUser } from '$lib/server/api-auth';
import { getPostHogClient } from '$lib/server/posthog';
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

	const result = await upsertUserLocation(userId, body?.latitude, body?.longitude, body?.timezone);

	// Mirror the web /api/location capture so native-client location updates are
	// visible in product analytics too.
	getPostHogClient()?.capture({
		distinctId: userId,
		event: 'location_updated',
		properties: { city: result.city, country_code: result.countryCode }
	});

	return json(result);
};
