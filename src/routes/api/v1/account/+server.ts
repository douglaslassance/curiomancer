import { eq } from 'drizzle-orm';
import { error, json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { placeRelation, user } from '$lib/server/db/schema';
import { requireApiUser } from '$lib/server/api-auth';
import { getUserLocation } from '$lib/server/current-location';
import { getInvitesFor } from '$lib/server/invites';
import { listApiTokens } from '$lib/server/api-tokens';
import { isSubscriber } from '$lib/server/subscriptions';
import type { RequestHandler } from './$types';

/**
 * GET /api/v1/account
 *
 * The viewer's own private account, mirroring the /settings load. This is the
 * one surface that returns email, role, invites, and the list of API tokens -
 * strictly the token owner's own data, never anyone else's. Distinct from
 * /api/v1/users/:id, which is the public profile view.
 *
 *   returns: { profile: { id, name, email, role, image }, location, likeCount, isSubscriber, invites, apiTokens }
 */
export const GET: RequestHandler = async ({ request }) => {
	const userId = await requireApiUser(request);

	const [[profile], location, likes, invites, apiTokens, subscriber] = await Promise.all([
		db
			.select({
				id: user.id,
				name: user.name,
				email: user.email,
				role: user.role,
				image: user.image
			})
			.from(user)
			.where(eq(user.id, userId))
			.limit(1),
		getUserLocation(userId),
		db.select({ id: placeRelation.id }).from(placeRelation).where(eq(placeRelation.userId, userId)),
		getInvitesFor(userId),
		listApiTokens(userId),
		isSubscriber(userId)
	]);

	if (!profile) throw error(404, 'Account not found');

	return json({
		profile: {
			id: profile.id,
			name: profile.name,
			email: profile.email,
			role: profile.role ?? 'user',
			image: profile.image ?? null
		},
		location: location ?? null,
		likeCount: likes.length,
		isSubscriber: subscriber,
		invites,
		apiTokens
	});
};
