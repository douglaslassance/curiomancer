import { error, json } from '@sveltejs/kit';
import {
	deleteMessage,
	editMessage,
	getMessageForMutation,
	MAX_MESSAGE_LENGTH
} from '$lib/server/messages';
import { broadcast } from '$lib/server/ws/registry';
import type { RequestHandler } from './$types';

/**
 * PATCH /api/messages/[id] - edit the signed-in user's own message body.
 *
 *   body: { body: string }
 *   returns: { body, editedAt }
 */
export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user) throw error(401, 'Sign in first.');

	const payload = (await request.json().catch(() => null)) as { body?: unknown } | null;
	const body = typeof payload?.body === 'string' ? payload.body.trim() : '';
	if (!body) throw error(400, 'body required.');
	if (body.length > MAX_MESSAGE_LENGTH) {
		throw error(400, `body must be ${MAX_MESSAGE_LENGTH} characters or fewer.`);
	}

	const existing = await getMessageForMutation(params.id);
	if (!existing || existing.deletedAt) throw error(404, 'Message not found.');
	if (existing.senderId !== locals.user.id) throw error(403, 'Not your message.');

	const editedAt = await editMessage(params.id, body);
	const editedAtIso = editedAt.toISOString();
	// Exclude the actor: they apply their own edit optimistically from this
	// response, so echoing it back would be redundant.
	broadcast(
		existing.conversationId,
		{ type: 'message:edited', messageId: params.id, body, editedAt: editedAtIso },
		locals.user.id
	);
	return json({ body, editedAt: editedAtIso });
};

/**
 * DELETE /api/messages/[id] - soft-delete the signed-in user's own message.
 * Clears its body and reactions but keeps the row so replies quoting it
 * still resolve.
 *
 *   returns: { deletedAt }
 */
export const DELETE: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) throw error(401, 'Sign in first.');

	const existing = await getMessageForMutation(params.id);
	if (!existing || existing.deletedAt) throw error(404, 'Message not found.');
	if (existing.senderId !== locals.user.id) throw error(403, 'Not your message.');

	const deletedAt = await deleteMessage(params.id);
	const deletedAtIso = deletedAt.toISOString();
	broadcast(
		existing.conversationId,
		{ type: 'message:deleted', messageId: params.id, deletedAt: deletedAtIso },
		locals.user.id
	);
	return json({ deletedAt: deletedAtIso });
};
