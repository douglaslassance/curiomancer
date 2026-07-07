import { error, json } from '@sveltejs/kit';
import { requireApiUser } from '$lib/server/api-auth';
import { getMessages, isParticipant, MAX_MESSAGE_LENGTH, sendMessage } from '$lib/server/messages';
import { getReactionsFor } from '$lib/server/reactions';
import { parseHistoryQuery } from '$lib/server/messages-query';
import { isSubscriber } from '$lib/server/subscriptions';
import { toMessagePayload } from '$lib/server/ws/protocol';
import { broadcast } from '$lib/server/ws/registry';
import type { RequestHandler } from './$types';

/**
 * GET /api/v1/conversations/[id]?since=<ISO>|before=<ISO>&limit=<n>
 *
 * Message history for an already-known conversation id. `since` refetches only
 * what a reconnecting client missed; `before` pages older messages on
 * scroll-up; the bare call returns the latest page. Response includes `hasMore`
 * so the client knows whether to keep backfilling.
 */
export const GET: RequestHandler = async ({ params, request, url }) => {
	const userId = await requireApiUser(request);
	if (!(await isSubscriber(userId))) throw error(403, 'Subscription required.');
	if (!(await isParticipant(params.id, userId))) throw error(404, 'Conversation not found.');

	const { since, before, limit } = parseHistoryQuery(url);
	const messages = await getMessages(params.id, { since, before, limit });
	const reactions = await getReactionsFor(messages.map((m) => m.id));

	return json({
		messages: messages.map(toMessagePayload),
		reactionsByMessage: Object.fromEntries(reactions),
		hasMore: !since && messages.length === limit
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
	if (!(await isSubscriber(userId))) throw error(403, 'Subscription required.');
	if (!(await isParticipant(params.id, userId))) throw error(404, 'Conversation not found.');

	const payload = (await request.json().catch(() => null)) as {
		body?: unknown;
		replyToId?: unknown;
	} | null;
	const body = typeof payload?.body === 'string' ? payload.body.trim() : '';
	const replyToId = typeof payload?.replyToId === 'string' ? payload.replyToId : null;
	if (!body) throw error(400, 'body required.');
	if (body.length > MAX_MESSAGE_LENGTH) {
		throw error(400, `body must be ${MAX_MESSAGE_LENGTH} characters or fewer.`);
	}

	const message = await sendMessage(params.id, userId, body, replyToId);
	const wireMessage = toMessagePayload(message);
	broadcast(params.id, { type: 'message:new', message: wireMessage });

	return json({ message: wireMessage });
};
