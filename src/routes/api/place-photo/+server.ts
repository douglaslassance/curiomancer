import { json, error } from '@sveltejs/kit';
import { getPlacePhotoFor } from '$lib/server/place-photo';
import type { RequestHandler } from './$types';

/**
 * Returns `{ url, website }` for a place: its display photo (null when none
 * exists, and the caller falls back to the map view) and the venue's own
 * website (null when it has none), which the place cards link out to.
 *
 * Accepts either `?externalId=` (an Apple Place ID, e.g. a Tune POI not yet
 * saved) or `?placeId=` (a saved place row). Cached per Apple ID, so this is
 * cheap after the first hit and resolves each place at most once. The native
 * apps use the identical `/api/v1/place-photo`.
 */
export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) throw error(401, 'Sign in.');

	return json(
		await getPlacePhotoFor({
			placeId: url.searchParams.get('placeId'),
			externalId: url.searchParams.get('externalId')
		})
	);
};
