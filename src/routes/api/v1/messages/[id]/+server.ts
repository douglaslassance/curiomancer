import { error, json } from '@sveltejs/kit';
import { requireApiUser } from '$lib/server/api-auth';
import {
	deleteMessage,
	editMessage,
	getMessageForMutation,
	MAX_MESSAGE_LENGTH
} from '$lib/server/messages';
import { broadcast } from '$lib/server/ws/registry';
import type { RequestHandler } from './$types';

/**
 * PATCH /api/v1/messages/[id]
 *
 * Token-authenticated twin of /api/messages/[id]. Edits the caller's own
 * message body.
 *
 *   body: { body: string }
 *   returns: { body, editedAt }
 */
export const PATCH: RequestHandler = async ({ params, request }) => {
	const userId = await requireApiUser(request);

	const payload = (await request.json().catch(() => null)) as { body?: unknown } | null;
	const body = typeof payload?.body === 'string' ? payload.body.trim() : '';
	if (!body) throw error(400, 'body required.');
	if (body.length > MAX_MESSAGE_LENGTH) {
		throw error(400, `body must be ${MAX_MESSAGE_LENGTH} characters or fewer.`);
	}

	const existing = await getMessageForMutation(params.id);
	if (!existing || existing.deletedAt) throw error(404, 'Message not found.');
	if (existing.senderId !== userId) throw error(403, 'Not your message.');

	const editedAt = await editMessage(params.id, body);
	const editedAtIso = editedAt.toISOString();
	broadcast(
		existing.conversationId,
		{ type: 'message:edited', messageId: params.id, body, editedAt: editedAtIso },
		userId
	);
	return json({ body, editedAt: editedAtIso });
};

/**
 * DELETE /api/v1/messages/[id]
 *
 * Token-authenticated twin of /api/messages/[id]. Soft-deletes the caller's
 * own message.
 *
 *   returns: { deletedAt }
 */
export const DELETE: RequestHandler = async ({ params, request }) => {
	const userId = await requireApiUser(request);

	const existing = await getMessageForMutation(params.id);
	if (!existing || existing.deletedAt) throw error(404, 'Message not found.');
	if (existing.senderId !== userId) throw error(403, 'Not your message.');

	const deletedAt = await deleteMessage(params.id);
	const deletedAtIso = deletedAt.toISOString();
	broadcast(
		existing.conversationId,
		{ type: 'message:deleted', messageId: params.id, deletedAt: deletedAtIso },
		userId
	);
	return json({ deletedAt: deletedAtIso });
};
