import { error } from '@sveltejs/kit';
import { asc, eq, getTableColumns, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	follow,
	placeRelation,
	place,
	user,
	userLocation,
	type Place
} from '$lib/server/db/schema';
import { isFollowing } from '$lib/server/follows';
import { getPairScore } from '$lib/server/matching';
import type { PageServerLoad } from './$types';

/**
 * Public profile for a Curiomancer user.
 *
 * v1 shows what they like + where they are. Public to everyone (signed in
 * or not). When a viewer is signed in we also compute their Jaccard
 * similarity + the subset of places both have liked, so the page is the
 * natural answer to "why is this person in my matches?"
 */
export const load: PageServerLoad = async ({ params, locals }) => {
	const [profile] = await db
		.select({
			id: user.id,
			name: user.name,
			image: user.image,
			createdAt: user.createdAt
		})
		.from(user)
		.where(eq(user.id, params.id))
		.limit(1);
	if (!profile) throw error(404, 'User not found');

	const [location] = await db
		.select({
			city: userLocation.city,
			countryCode: userLocation.countryCode,
			timezone: userLocation.timezone
		})
		.from(userLocation)
		.where(eq(userLocation.userId, params.id))
		.limit(1);

	const likedPlaces = await db
		.select(getTableColumns(place))
		.from(place)
		.innerJoin(placeRelation, eq(placeRelation.placeId, place.id))
		.where(eq(placeRelation.userId, params.id))
		.orderBy(asc(place.city), asc(place.name));

	const [following, followers] = await Promise.all([
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

	// Compute similarity with the viewer (if signed in and not viewing self).
	let viewer: {
		isSelf: boolean;
		score: number | null;
		sharedCount: number;
		sharedPlaces: Place[];
		following: boolean;
	} | null = null;

	if (locals.user) {
		const isSelf = locals.user.id === params.id;
		if (!isSelf) {
			// Score comes from the shared matching helper so it can't disagree
			// with the people list. `shared` is the places both actually like
			// (the "You both like" set), which is a different thing from the
			// score's liked+disliked overlap - so we still query it separately.
			const [viewerFollows, pair] = await Promise.all([
				isFollowing(locals.user.id, params.id),
				getPairScore(locals.user.id, params.id)
			]);
			const shared = await db.execute<{
				id: string;
				name: string;
				category: 'eat' | 'drink' | 'shop' | 'visit';
				city: string;
				neighborhood: string | null;
				description: string;
				latitude: number | null;
				longitude: number | null;
				source: 'apple' | 'seed' | 'manual';
				external_id: string | null;
				created_at: Date;
			}>(sql`
				SELECT p.*
				FROM place p
				JOIN "place_relation" mine ON mine.place_id = p.id AND mine.user_id = ${locals.user.id} AND mine.kind = 'liked'
				JOIN "place_relation" theirs ON theirs.place_id = p.id AND theirs.user_id = ${params.id} AND theirs.kind = 'liked'
				ORDER BY p.city, p.name
			`);

			viewer = {
				isSelf: false,
				score: pair.score,
				sharedCount: pair.sharedCount,
				sharedPlaces: shared.map((r) => ({
					id: r.id,
					name: r.name,
					category: r.category,
					city: r.city,
					neighborhood: r.neighborhood,
					description: r.description,
					latitude: r.latitude,
					longitude: r.longitude,
					source: r.source,
					externalId: r.external_id,
					createdAt: r.created_at
				})),
				following: viewerFollows
			};
		} else {
			viewer = { isSelf: true, score: null, sharedCount: 0, sharedPlaces: [], following: false };
		}
	}

	return { profile, location, likedPlaces, following, followers, viewer };
};
