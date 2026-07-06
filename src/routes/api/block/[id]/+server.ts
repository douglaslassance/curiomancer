import { error, json } from '@sveltejs/kit';
import { blockUser, unblockUser } from '$lib/server/blocks';
import { getPostHogClient } from '$lib/server/posthog';
import type { RequestHandler } from './$types';

/**
 * POST /api/block/[id]   - block user [id]
 * DELETE /api/block/[id] - unblock user [id]
 *
 * Idempotent on both sides (insert ON CONFLICT DO NOTHING, delete on a
 * non-existent row no-ops). Self-block is rejected at the DB CHECK but we
 * surface a friendlier 400 here too.
 */
export const POST: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) throw error(401, 'Sign in to block people.');
	if (locals.user.id === params.id) throw error(400, 'You cannot block yourself.');
	await blockUser(locals.user.id, params.id);
	getPostHogClient()?.capture({
		distinctId: locals.user.id,
		event: 'user_blocked',
		properties: { blocked_user_id: params.id }
	});
	return json({ blocked: true });
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) throw error(401, 'Sign in first.');
	await unblockUser(locals.user.id, params.id);
	getPostHogClient()?.capture({
		distinctId: locals.user.id,
		event: 'user_unblocked',
		properties: { unblocked_user_id: params.id }
	});
	return json({ blocked: false });
};
