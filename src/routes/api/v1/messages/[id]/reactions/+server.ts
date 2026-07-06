import { error, json } from '@sveltejs/kit';
import { requireApiUser } from '$lib/server/api-auth';
import { getMessageConversationId, isParticipant } from '$lib/server/messages';
import { toggleReaction } from '$lib/server/reactions';
import { broadcast } from '$lib/server/ws/registry';
import type { RequestHandler } from './$types';

/**
 * POST /api/v1/messages/[id]/reactions
 *
 * Token-authenticated twin of /api/messages/[id]/reactions. `id` is the
 * message id; posting an emoji already reacted with removes it.
 *
 *   body: { emoji: string }
 *   returns: { emoji, added: boolean }
 */
export const POST: RequestHandler = async ({ params, request }) => {
	const userId = await requireApiUser(request);

	const body = (await request.json().catch(() => null)) as { emoji?: unknown } | null;
	const emoji = typeof body?.emoji === 'string' ? body.emoji : null;
	if (!emoji) throw error(400, 'emoji required.');

	const conversationId = await getMessageConversationId(params.id);
	if (!conversationId || !(await isParticipant(conversationId, userId))) {
		throw error(404, 'Message not found.');
	}

	const result = await toggleReaction(params.id, userId, emoji);
	// Exclude the actor: they apply their own toggle optimistically from this
	// response, so echoing it back would be redundant.
	broadcast(
		conversationId,
		{
			type: result.added ? 'reaction:added' : 'reaction:removed',
			messageId: params.id,
			userId,
			emoji
		},
		userId
	);
	return json({ emoji, added: result.added });
};
