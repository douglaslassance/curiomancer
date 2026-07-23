import { error, json } from '@sveltejs/kit';
import { savePlaceRelation } from '$lib/server/add-place';
import type { SavePlaceInput } from '$lib/server/add-place';
import type { RequestHandler } from './$types';

/**
 * Upsert a place by (source, external_id) and set the user's relation to it.
 * Returns the place id so the caller can navigate or refresh the map. The
 * upsert/dedupe/rating logic is shared with the native `POST /api/v1/places`
 * via `savePlaceRelation`.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) throw error(401, 'Sign in to add places.');

	const body = (await request.json().catch(() => null)) as SavePlaceInput | null;
	if (!body) throw error(400, 'Invalid body');

	const result = await savePlaceRelation(locals.user.id, body);
	if (!result.ok) throw error(result.status, result.message);

	return json({ placeId: result.placeId, kind: result.kind });
};
