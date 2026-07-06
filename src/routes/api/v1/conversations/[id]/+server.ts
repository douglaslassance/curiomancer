import { error, json } from '@sveltejs/kit';
import { requireApiUser } from '$lib/server/api-auth';
import { getMessages, isParticipant, sendMessage } from '$lib/server/messages';
import { getReactionsFor } from '$lib/server/reactions';
import { broadcast } from '$lib/server/ws/registry';
import type { RequestHandler } from './$types';

/**
 * GET /api/v1/conversations/[id]?since=<ISO timestamp>
 *
 * Message history for an already-known conversation id, with an optional
 * `since` cursor - used by ChatSocket's resync-on-reconnect flow to refetch
 * only what was missed while disconnected, and by the initial thread load.
 */
export const GET: RequestHandler = async ({ params, request, url }) => {
	const userId = await requireApiUser(request);
	if (!(await isParticipant(params.id, userId))) throw error(404, 'Conversation not found.');

	const sinceParam = url.searchParams.get('since');
	const since = sinceParam ? new Date(sinceParam) : undefined;
	if (since && Number.isNaN(since.getTime())) throw error(400, 'Invalid since timestamp.');

	const messages = await getMessages(params.id, { since });
	const reactions = await getReactionsFor(messages.map((m) => m.id));

	return json({
		messages: messages.map((m) => ({ ...m, createdAt: m.createdAt.toISOString() })),
		reactionsByMessage: Object.fromEntries(reactions)
	});
};

/**
 * POST /api/v1/conversations/[id]
 *
 * Sends a message to a conversation the caller already knows the id of
 * (from the list endpoint or the create-conversation response). For
 * starting a brand new conversation, use POST /api/v1/conversations
 * instead - this endpoint 404s if the caller isn't already a participant.
 *
 *   body: { body: string, replyToId?: string }
 *   returns: { message }
 */
export const POST: RequestHandler = async ({ params, request }) => {
	const userId = await requireApiUser(request);
	if (!(await isParticipant(params.id, userId))) throw error(404, 'Conversation not found.');

	const payload = (await request.json().catch(() => null)) as {
		body?: unknown;
		replyToId?: unknown;
	} | null;
	const body = typeof payload?.body === 'string' ? payload.body.trim() : '';
	const replyToId = typeof payload?.replyToId === 'string' ? payload.replyToId : null;
	if (!body) throw error(400, 'body required.');

	const message = await sendMessage(params.id, userId, body, replyToId);
	broadcast(params.id, {
		type: 'message:new',
		message: { ...message, createdAt: message.createdAt.toISOString() }
	});

	return json({ message: { ...message, createdAt: message.createdAt.toISOString() } });
};
