import { json } from '@sveltejs/kit';
import { ratePlace } from '$lib/server/likes';
import { requireApiUser } from '$lib/server/api-auth';
import type { RequestHandler } from './$types';

/**
 * POST /api/v1/relations
 *
 * Token-authenticated twin of /api/relations: set or clear the viewer's stance
 * on a place. Toggle semantics - posting the kind that is already set clears
 * it; posting a different kind replaces it. At most one relation per place.
 *
 *   body: { placeId, kind: 'liked' | 'disliked' | 'seen' | 'want_to_go' }
 *   returns: { placeId, kind: <kind> | null }
 */
export const POST: RequestHandler = async ({ request }) => {
	const userId = await requireApiUser(request);
	const body = (await request.json().catch(() => null)) as {
		placeId?: unknown;
		kind?: unknown;
	} | null;
	return json(await ratePlace(userId, body?.placeId, body?.kind));
};
