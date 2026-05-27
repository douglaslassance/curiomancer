import { error, json } from '@sveltejs/kit';
import { setRelation } from '$lib/server/likes';
import type { PlaceRelationKind } from '$lib/server/db/schema';
import type { RequestHandler } from './$types';

/**
 * Set or clear a user's stance on a place.
 *
 *   body: { placeId: string, kind: 'liked' | 'disliked' | 'want_to_go' }
 *   returns: { placeId, kind: 'liked' | 'disliked' | 'want_to_go' | null }
 *
 * Toggle semantics: posting the same kind that's already set clears it.
 * Posting a different kind replaces the existing relation. There's at
 * most one relation per (user, place) at any time.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) throw error(401, 'Sign in to react to places.');

	const body = (await request.json().catch(() => null)) as {
		placeId?: unknown;
		kind?: unknown;
	} | null;

	const placeId = typeof body?.placeId === 'string' ? body.placeId : null;
	const kind = body?.kind;

	if (!placeId) throw error(400, 'placeId required.');
	if (kind !== 'liked' && kind !== 'disliked' && kind !== 'want_to_go') {
		throw error(400, "kind must be 'liked', 'disliked', or 'want_to_go'.");
	}

	const result = await setRelation(locals.user.id, placeId, kind as PlaceRelationKind);
	return json({ placeId, kind: result });
};
