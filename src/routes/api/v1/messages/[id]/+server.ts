import { json } from '@sveltejs/kit';
import { requireApiUser } from '$lib/server/api-auth';
import { deleteOwnMessage, editOwnMessage } from '$lib/server/messages';
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
	return json(await editOwnMessage(params.id, userId, payload?.body));
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
	return json(await deleteOwnMessage(params.id, userId));
};
