import { json } from '@sveltejs/kit';
import { requireApiUser } from '$lib/server/api-auth';
import { reactToMessage } from '$lib/server/reactions';
import type { RequestHandler } from './$types';

/**
 * POST /api/v1/messages/[id]/reactions
 *
 * Token-authenticated twin of /api/messages/[id]/reactions. `id` is the
 * message id; posting an emoji already reacted with removes it.
 *
 *   body: { emoji: string }
 *   returns: { emoji, added: boolean }
 */
export const POST: RequestHandler = async ({ params, request }) => {
	const userId = await requireApiUser(request);
	const body = (await request.json().catch(() => null)) as { emoji?: unknown } | null;
	return json(await reactToMessage(params.id, userId, body?.emoji));
};
