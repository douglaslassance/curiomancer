import { error, json } from '@sveltejs/kit';
import { reactToMessage } from '$lib/server/reactions';
import type { RequestHandler } from './$types';

/**
 * POST /api/messages/[id]/reactions - toggle the signed-in user's reaction
 * on a message. `id` is the message id. Posting an emoji already reacted
 * with removes it.
 *
 *   body: { emoji: string }
 *   returns: { emoji, added: boolean }
 */
export const POST: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user) throw error(401, 'Sign in first.');
	const body = (await request.json().catch(() => null)) as { emoji?: unknown } | null;
	return json(await reactToMessage(params.id, locals.user.id, body?.emoji));
};
