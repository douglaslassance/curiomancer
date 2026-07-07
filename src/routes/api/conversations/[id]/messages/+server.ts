import { error, json } from '@sveltejs/kit';
import { findConversation, getMessages } from '$lib/server/messages';
import { getReactionsFor } from '$lib/server/reactions';
import { parseHistoryQuery } from '$lib/server/messages-query';
import { toMessagePayload } from '$lib/server/ws/protocol';
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

	const conversationId = await findConversation(locals.user.id, params.id);
	if (!conversationId) return json({ messages: [], reactionsByMessage: {}, hasMore: false });

	const { since, before, limit } = parseHistoryQuery(url);
	const messages = await getMessages(conversationId, { since, before, limit });
	const reactions = await getReactionsFor(messages.map((m) => m.id));

	return json({
		messages: messages.map(toMessagePayload),
		reactionsByMessage: Object.fromEntries(reactions),
		// A full page implies there may be older messages still. Never "more"
		// on a `since` resync, which returns the whole gap.
		hasMore: !since && messages.length === limit
	});
};
