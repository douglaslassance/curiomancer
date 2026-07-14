import { error, json } from '@sveltejs/kit';
import { ratePlace } from '$lib/server/likes';
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
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) throw error(401, 'Sign in to react to places.');
	const body = (await request.json().catch(() => null)) as {
		placeId?: unknown;
		kind?: unknown;
	} | null;
	return json(await ratePlace(locals.user.id, body?.placeId, body?.kind));
};
