import { error, json } from '@sveltejs/kit';
import { setRelation } from '$lib/server/likes';
import { requireApiUser } from '$lib/server/api-auth';
import type { PlaceRelationKind } from '$lib/server/db/schema';
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
const VALID_KINDS = ['liked', 'disliked', 'seen', 'want_to_go'] as const;

export const POST: RequestHandler = async ({ request }) => {
	const userId = await requireApiUser(request);

	const body = (await request.json().catch(() => null)) as {
		placeId?: unknown;
		kind?: unknown;
	} | null;

	const placeId = typeof body?.placeId === 'string' ? body.placeId : null;
	const kind = body?.kind;

	if (!placeId) throw error(400, 'placeId required.');
	if (typeof kind !== 'string' || !VALID_KINDS.includes(kind as PlaceRelationKind)) {
		throw error(400, `kind must be one of: ${VALID_KINDS.join(', ')}.`);
	}

	const result = await setRelation(userId, placeId, kind as PlaceRelationKind);
	return json({ placeId, kind: result });
};
