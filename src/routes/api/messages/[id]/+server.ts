import { error, json } from '@sveltejs/kit';
import { deleteOwnMessage, editOwnMessage } from '$lib/server/messages';
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
	return json(await editOwnMessage(params.id, locals.user.id, payload?.body));
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
	return json(await deleteOwnMessage(params.id, locals.user.id));
};
