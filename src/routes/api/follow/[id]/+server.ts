import { error, json } from '@sveltejs/kit';
import { followUser, unfollowUser } from '$lib/server/follows';
import { getPostHogClient } from '$lib/server/posthog';
import type { RequestHandler } from './$types';

/**
 * POST /api/follow/[id]   - follow user [id]
 * DELETE /api/follow/[id] - unfollow user [id]
 *
 * Idempotent on both sides (insert ON CONFLICT DO NOTHING, delete on
 * a non-existent row no-ops). Self-follow is rejected at the DB CHECK
 * but we surface a friendlier 400 here too.
 */
export const POST: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) throw error(401, 'Sign in to follow people.');
	if (locals.user.id === params.id) throw error(400, 'You cannot follow yourself.');
	await followUser(locals.user.id, params.id);
	const posthog = getPostHogClient();
	posthog.capture({
		distinctId: locals.user.id,
		event: 'user_followed',
		properties: { followed_user_id: params.id }
	});
	return json({ following: true });
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) throw error(401, 'Sign in first.');
	await unfollowUser(locals.user.id, params.id);
	const posthog = getPostHogClient();
	posthog.capture({
		distinctId: locals.user.id,
		event: 'user_unfollowed',
		properties: { unfollowed_user_id: params.id }
	});
	return json({ following: false });
};
