import { error, json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { requireApiUser } from '$lib/server/api-auth';
import { db } from '$lib/server/db';
import { user } from '$lib/server/db/schema';
import { isBlocked } from '$lib/server/blocks';
import { areTwins } from '$lib/server/matching';
import {
	createConversation,
	findConversation,
	listConversationsFor,
	MAX_MESSAGE_LENGTH,
	sendMessage
} from '$lib/server/messages';
import { isSubscriber } from '$lib/server/subscriptions';
import { toMessagePayload } from '$lib/server/ws/protocol';
import { broadcast } from '$lib/server/ws/registry';
import type { RequestHandler } from './$types';

/**
 * GET /api/v1/conversations
 *
 * Token-authenticated twin of the web messages sidebar
 * (src/routes/messages/+layout.server.ts): every conversation the caller is
 * part of, most recently active first.
 */
export const GET: RequestHandler = async ({ request }) => {
	const userId = await requireApiUser(request);
	if (!(await isSubscriber(userId))) throw error(403, 'Subscription required.');
	const conversations = await listConversationsFor(userId);
	return json({ conversations });
};

/**
 * POST /api/v1/conversations
 *
 * Starts or continues a conversation with another user and sends the first
 * message in one call - mirrors what visiting /messages/[otherUserId] then
 * submitting the compose form does for the web app, condensed into a single
 * request since a native client has no page-load step to create the
 * conversation implicitly.
 *
 *   body: { otherUserId: string, body: string, replyToId?: string }
 *   returns: { conversationId, message }
 */
export const POST: RequestHandler = async ({ request }) => {
	const userId = await requireApiUser(request);
	if (!(await isSubscriber(userId))) throw error(403, 'Subscription required.');

	const payload = (await request.json().catch(() => null)) as {
		otherUserId?: unknown;
		body?: unknown;
		replyToId?: unknown;
	} | null;
	const otherUserId = typeof payload?.otherUserId === 'string' ? payload.otherUserId : null;
	const body = typeof payload?.body === 'string' ? payload.body.trim() : '';
	const replyToId = typeof payload?.replyToId === 'string' ? payload.replyToId : null;

	if (!otherUserId) throw error(400, 'otherUserId required.');
	if (otherUserId === userId) throw error(400, "You can't message yourself.");
	if (!body) throw error(400, 'body required.');
	if (body.length > MAX_MESSAGE_LENGTH) {
		throw error(400, `body must be ${MAX_MESSAGE_LENGTH} characters or fewer.`);
	}
	if (await isBlocked(userId, otherUserId)) throw error(404, 'User not found.');

	// Starting a NEW conversation is twins-only, and not with an incognito user.
	// Existing conversations keep working regardless.
	const existingId = await findConversation(userId, otherUserId);
	if (!existingId) {
		const [recipient] = await db
			.select({ incognito: user.incognito })
			.from(user)
			.where(eq(user.id, otherUserId))
			.limit(1);
		if (!recipient) throw error(404, 'User not found.');
		if (recipient.incognito || !(await areTwins(userId, otherUserId))) {
			throw error(403, 'You can only message your taste-twins.');
		}
	}

	const conversationId = existingId ?? (await createConversation(userId, otherUserId));
	const message = await sendMessage(conversationId, userId, body, replyToId);
	const wireMessage = toMessagePayload(message);
	broadcast(conversationId, { type: 'message:new', message: wireMessage });

	return json({ conversationId, message: wireMessage });
};
