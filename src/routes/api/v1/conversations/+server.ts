import { error, json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { requireApiUser } from '$lib/server/api-auth';
import { db } from '$lib/server/db';
import { user } from '$lib/server/db/schema';
import { isBlocked } from '$lib/server/blocks';
import {
	createConversation,
	findConversation,
	listConversationsFor,
	sendMessage
} from '$lib/server/messages';
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
	if (await isBlocked(userId, otherUserId)) throw error(404, 'User not found.');

	const existingId = await findConversation(userId, otherUserId);
	if (!existingId) {
		const [recipient] = await db
			.select({ messageable: user.messageable })
			.from(user)
			.where(eq(user.id, otherUserId))
			.limit(1);
		if (!recipient) throw error(404, 'User not found.');
		if (!recipient.messageable) throw error(403, "This person isn't accepting messages right now.");
	}

	const conversationId = existingId ?? (await createConversation(userId, otherUserId));
	const message = await sendMessage(conversationId, userId, body, replyToId);
	broadcast(conversationId, {
		type: 'message:new',
		message: { ...message, createdAt: message.createdAt.toISOString() }
	});

	return json({ conversationId, message: { ...message, createdAt: message.createdAt.toISOString() } });
};
