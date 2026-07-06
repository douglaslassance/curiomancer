import { error, json } from '@sveltejs/kit';
import { setRelation } from '$lib/server/likes';
import { getPostHogClient } from '$lib/server/posthog';
import type { PlaceRelationKind } from '$lib/server/db/schema';
import type { RequestHandler } from './$types';

/**
 * Set or clear a user's stance on a place.
 *
 *   body: { placeId: string, kind: 'liked' | 'disliked' | 'seen' | 'want_to_go' }
 *   returns: { placeId, kind: 'liked' | 'disliked' | 'seen' | 'want_to_go' | null }
 *
 * Toggle semantics: posting the same kind that's already set clears it.
 * Posting a different kind replaces the existing relation. There's at
 * most one relation per (user, place) at any time.
 */
const VALID_KINDS = ['liked', 'disliked', 'seen', 'want_to_go'] as const;

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) throw error(401, 'Sign in to react to places.');

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

	const result = await setRelation(locals.user.id, placeId, kind as PlaceRelationKind);

	getPostHogClient()?.capture({
		distinctId: locals.user.id,
		event: 'place_rated',
		properties: { place_id: placeId, kind: result }
	});

	return json({ placeId, kind: result });
};
