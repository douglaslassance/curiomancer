import { error, json } from '@sveltejs/kit';
import { followUser, unfollowUser } from '$lib/server/follows';
import { requireApiUser } from '$lib/server/api-auth';
import type { RequestHandler } from './$types';

/**
 * POST   /api/v1/follow/:id  - follow user :id
 * DELETE /api/v1/follow/:id  - unfollow user :id
 *
 * Token-authenticated twin of /api/follow/[id]. Idempotent on both sides;
 * self-follow is rejected. These are plain relationship writes, so unlike the
 * account/password edits they carry no better-auth session dependency.
 */
export const POST: RequestHandler = async ({ request, params }) => {
	const userId = await requireApiUser(request);
	if (userId === params.id) throw error(400, 'You cannot follow yourself.');
	await followUser(userId, params.id);
	return json({ following: true });
};

export const DELETE: RequestHandler = async ({ request, params }) => {
	const userId = await requireApiUser(request);
	await unfollowUser(userId, params.id);
	return json({ following: false });
};
