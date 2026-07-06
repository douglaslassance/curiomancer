import { error, json } from '@sveltejs/kit';
import { getMessageConversationId, isParticipant } from '$lib/server/messages';
import { toggleReaction } from '$lib/server/reactions';
import { broadcast } from '$lib/server/ws/registry';
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
	const emoji = typeof body?.emoji === 'string' ? body.emoji : null;
	if (!emoji) throw error(400, 'emoji required.');

	const conversationId = await getMessageConversationId(params.id);
	if (!conversationId || !(await isParticipant(conversationId, locals.user.id))) {
		throw error(404, 'Message not found.');
	}

	const result = await toggleReaction(params.id, locals.user.id, emoji);
	// Exclude the actor: they apply their own toggle optimistically from this
	// response, so echoing it back would be redundant (and could fight a
	// rapid follow-up toggle).
	broadcast(
		conversationId,
		{
			type: result.added ? 'reaction:added' : 'reaction:removed',
			messageId: params.id,
			userId: locals.user.id,
			emoji
		},
		locals.user.id
	);
	return json({ emoji, added: result.added });
};
