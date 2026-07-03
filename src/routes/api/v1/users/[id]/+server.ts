import { asc, eq, getTableColumns } from 'drizzle-orm';
import { error, json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { follow, place, placeRelation, user, userLocation } from '$lib/server/db/schema';
import { isFollowing } from '$lib/server/follows';
import { getPairScore } from '$lib/server/matching';
import { requireApiUser } from '$lib/server/api-auth';
import type { RequestHandler } from './$types';

/**
 * GET /api/v1/users/:id
 *
 * A public profile: what someone likes, where they are, and (relative to the
 * viewer) how strongly you match. Mirrors the /users/[id] page load.
 *
 * Privacy: unlike /api/v1/account and /dashboard, this NEVER returns another
 * user's email, role, or exact coordinates - only city / country / timezone,
 * matching what the web profile page exposes publicly.
 *
 *   returns: { profile, location, likedPlaces, following, followers, viewer }
 */
export const GET: RequestHandler = async ({ request, params }) => {
	const viewerId = await requireApiUser(request);

	const [profile] = await db
		.select({ id: user.id, name: user.name, image: user.image, createdAt: user.createdAt })
		.from(user)
		.where(eq(user.id, params.id))
		.limit(1);
	if (!profile) throw error(404, 'User not found');

	// City-level only. Exact lat/lng is deliberately withheld for other users.
	const [location] = await db
		.select({
			city: userLocation.city,
			countryCode: userLocation.countryCode,
			timezone: userLocation.timezone
		})
		.from(userLocation)
		.where(eq(userLocation.userId, params.id))
		.limit(1);

	const [likedPlaces, following, followers] = await Promise.all([
		db
			.select(getTableColumns(place))
			.from(place)
			.innerJoin(placeRelation, eq(placeRelation.placeId, place.id))
			.where(eq(placeRelation.userId, params.id))
			.orderBy(asc(place.city), asc(place.name)),
		db
			.select({ id: user.id, name: user.name, image: user.image })
			.from(follow)
			.innerJoin(user, eq(user.id, follow.followedId))
			.where(eq(follow.followerId, params.id))
			.orderBy(asc(user.name)),
		db
			.select({ id: user.id, name: user.name, image: user.image })
			.from(follow)
			.innerJoin(user, eq(user.id, follow.followerId))
			.where(eq(follow.followedId, params.id))
			.orderBy(asc(user.name))
	]);

	// Viewer-relative similarity, unless the viewer is looking at themselves.
	const isSelf = viewerId === params.id;
	let viewer: {
		isSelf: boolean;
		score: number | null;
		sharedCount: number;
		following: boolean;
	};
	if (isSelf) {
		viewer = { isSelf: true, score: null, sharedCount: 0, following: false };
	} else {
		const [viewerFollows, pair] = await Promise.all([
			isFollowing(viewerId, params.id),
			getPairScore(viewerId, params.id)
		]);
		viewer = {
			isSelf: false,
			score: pair.score,
			sharedCount: pair.sharedCount,
			following: viewerFollows
		};
	}

	return json({ profile, location: location ?? null, likedPlaces, following, followers, viewer });
};
