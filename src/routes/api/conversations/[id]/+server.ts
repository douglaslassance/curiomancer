import { error, json } from '@sveltejs/kit';
import { deleteConversation, findConversation } from '$lib/server/messages';
import type { RequestHandler } from './$types';

/**
 * DELETE /api/conversations/[id] - delete the conversation with user [id].
 *
 * `id` is the other user's id (not the conversation id) so this mirrors
 * /api/block/[id] and the client never needs to know the conversation's
 * own id. No-op (still 200) if no conversation exists.
 */
export const DELETE: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) throw error(401, 'Sign in first.');

	const conversationId = await findConversation(locals.user.id, params.id);
	if (conversationId) await deleteConversation(conversationId);

	return json({ deleted: true });
};
