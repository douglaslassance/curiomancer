import { json } from '@sveltejs/kit';
import { requireApiUser } from '$lib/server/api-auth';
import { getPlacePhotoFor } from '$lib/server/place-photo';
import type { RequestHandler } from './$types';

/**
 * GET /api/v1/place-photo?placeId= | ?externalId=
 *
 * Native counterpart of the web `/api/place-photo`, sharing the same resolver
 * and per-Apple-ID cache. Returns `{ url, website }`: the venue website's
 * preview image (null when there's no photo, so the iOS/Android clients show
 * the place's map the same way the web card does) and the website itself.
 */
export const GET: RequestHandler = async ({ request, url }) => {
	await requireApiUser(request);

	return json(
		await getPlacePhotoFor({
			placeId: url.searchParams.get('placeId'),
			externalId: url.searchParams.get('externalId')
		})
	);
};
