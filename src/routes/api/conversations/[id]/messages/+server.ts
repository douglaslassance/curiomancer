import { error, json } from '@sveltejs/kit';
import { findConversation, getMessages } from '$lib/server/messages';
import { getReactionsFor } from '$lib/server/reactions';
import type { RequestHandler } from './$types';

/**
 * GET /api/conversations/[id]/messages?since=<ISO timestamp>
 *
 * `id` is the other user's id, matching this route's existing DELETE
 * convention. Used by the client-side conversation store to resync after a
 * dropped WebSocket connection - the cookie-authenticated twin of
 * GET /api/v1/conversations/[conversationId] (which is token-only, so the
 * browser can't call it directly).
 */
export const GET: RequestHandler = async ({ params, url, locals }) => {
	if (!locals.user) throw error(401, 'Sign in first.');

	const conversationId = await findConversation(locals.user.id, params.id);
	if (!conversationId) return json({ messages: [], reactionsByMessage: {} });

	const sinceParam = url.searchParams.get('since');
	const since = sinceParam ? new Date(sinceParam) : undefined;
	if (since && Number.isNaN(since.getTime())) throw error(400, 'Invalid since timestamp.');

	const messages = await getMessages(conversationId, { since });
	const reactions = await getReactionsFor(messages.map((m) => m.id));

	return json({
		messages: messages.map((m) => ({ ...m, createdAt: m.createdAt.toISOString() })),
		reactionsByMessage: Object.fromEntries(reactions)
	});
};
