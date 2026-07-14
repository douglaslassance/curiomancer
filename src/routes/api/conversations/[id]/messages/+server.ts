import { error, json } from '@sveltejs/kit';
import { findConversation } from '$lib/server/messages';
import { getConversationHistory } from '$lib/server/messages-query';
import { isSubscriber } from '$lib/server/subscriptions';
import type { RequestHandler } from './$types';

/**
 * GET /api/conversations/[id]/messages?since=<ISO>|before=<ISO>&limit=<n>
 *
 * `id` is the other user's id, matching this route's existing DELETE
 * convention. Used by the client-side conversation store: `since` to resync
 * after a dropped WebSocket connection, `before` to backfill older messages on
 * scroll-up. The cookie-authenticated twin of
 * GET /api/v1/conversations/[conversationId] (which is token-only, so the
 * browser can't call it directly).
 */
export const GET: RequestHandler = async ({ params, url, locals }) => {
	if (!locals.user) throw error(401, 'Sign in first.');
	if (!(await isSubscriber(locals.user.id))) throw error(403, 'Subscription required.');

	const conversationId = await findConversation(locals.user.id, params.id);
	if (!conversationId) return json({ messages: [], reactionsByMessage: {}, hasMore: false });

	return json(await getConversationHistory(conversationId, url));
};
