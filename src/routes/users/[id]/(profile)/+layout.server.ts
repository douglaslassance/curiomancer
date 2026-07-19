import { error } from '@sveltejs/kit';
import { asc, eq, getTableColumns, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	placeRelation,
	place,
	user,
	userLocation,
	type Place,
	type PlaceRelationKind
} from '$lib/server/db/schema';
import { isBlocked } from '$lib/server/blocks';
import { getPairScore } from '$lib/server/matching';
import { MATCH_THRESHOLD } from '$lib/server/similarity';
import { isAdmin } from '$lib/server/admin';
import { isSubscriber } from '$lib/server/subscriptions';
import type { LayoutServerLoad } from './$types';

export type SharedPlace = Place & { kind: PlaceRelationKind };

/**
 * Profile for a Curiomancer user - shared across the Likes (default), Want to
 * go, Disliked, and Twins tabs. Gated behind sign-in by the central guard in
 * hooks.server.ts (/users/* is not a public path).
 *
 * Access is twins-only: unless you're viewing yourself (or you're an admin),
 * you can only see a profile if you're an actual taste-twin of theirs (match
 * above MATCH_THRESHOLD). Guessing someone's URL as a non-twin 404s. An
 * incognito user is hidden from everyone but themselves, so their profile
 * 404s for all others too. Blocked pairs 404 either way.
 *
 * A viewer only ever sees their OWN full lists. On someone else's profile we
 * return match score + the places where you both landed on the same stance
 * (viewer.sharedPlaces) - the "why is this person in my matches?" view - and
 * deliberately NOT their full like/dislike lists, so a match can't be gamed or
 * mined by browsing what someone likes.
 */
export const load: LayoutServerLoad = async ({ params, locals }) => {
	const [profile] = await db
		.select({
			id: user.id,
			name: user.name,
			image: user.image,
			createdAt: user.createdAt,
			incognito: user.incognito
		})
		.from(user)
		.where(eq(user.id, params.id))
		.limit(1);
	if (!profile) throw error(404, 'User not found');

	const isSelf = locals.user?.id === params.id;

	// Access gate. Admins bypass it (moderation); the owner always sees their
	// own profile. Everyone else must be an un-blocked, non-incognito taste-twin.
	// `pair` is reused below for the viewer's match badge so we don't score twice.
	let pair: { score: number | null; sharedCount: number } | null = null;
	if (!isSelf && !isAdmin(locals.user)) {
		// locals.user is guaranteed here by the central sign-in guard.
		if (!locals.user) throw error(404, 'User not found');
		if (await isBlocked(locals.user.id, params.id)) throw error(404, 'User not found');
		if (profile.incognito) throw error(404, 'User not found');
		pair = await getPairScore(locals.user.id, params.id);
		if (pair.score === null || pair.score <= MATCH_THRESHOLD) {
			throw error(404, 'User not found');
		}
	}

	const [location] = await db
		.select({
			city: userLocation.city,
			countryCode: userLocation.countryCode,
			timezone: userLocation.timezone
		})
		.from(userLocation)
		.where(eq(userLocation.userId, params.id))
		.limit(1);

	// Despite the name, this covers all four relation kinds, not just liked -
	// the per-kind tabs (Likes/Want to go/Disliked) filter it client-side.
	// We query it for everyone (to count likes for the header) but only ever
	// send the full list back to the owner: a non-owner's UI shows shared
	// overlaps, so shipping the full list would just leak it via the page data.
	const allRelations: SharedPlace[] = await db
		.select({ ...getTableColumns(place), kind: placeRelation.kind })
		.from(place)
		.innerJoin(placeRelation, eq(placeRelation.placeId, place.id))
		.where(eq(placeRelation.userId, params.id))
		.orderBy(asc(place.city), asc(place.name));
	const likedCount = allRelations.filter((p) => p.kind === 'liked').length;
	const likedPlaces = isSelf ? allRelations : [];

	// Compute similarity with the viewer (if signed in and not viewing self).
	let viewer: {
		isSelf: boolean;
		isSubscriber: boolean;
		score: number | null;
		sharedCount: number;
		sharedPlaces: SharedPlace[];
	} | null = null;

	if (locals.user) {
		if (!isSelf) {
			// Score comes from the shared matching helper so it can't disagree
			// with the people list. `shared` is every place where both of you
			// landed on the SAME kind (both liked, both disliked, both seen,
			// both want-to-go) - a different thing from the score's liked+
			// disliked overlap, so we still query it separately.
			// The gate already scored the pair for non-admins; admins skipped it,
			// so fall back to computing it here.
			const [resolvedPair, subscriber] = await Promise.all([
				pair ?? getPairScore(locals.user.id, params.id),
				isSubscriber(locals.user.id)
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
				kind: PlaceRelationKind;
			}>(sql`
				SELECT p.*, mine.kind AS kind
				FROM place p
				JOIN "place_relation" mine ON mine.place_id = p.id AND mine.user_id = ${locals.user.id}
				JOIN "place_relation" theirs ON theirs.place_id = p.id AND theirs.user_id = ${params.id} AND theirs.kind = mine.kind
				ORDER BY p.city, p.name
			`);

			viewer = {
				isSelf: false,
				isSubscriber: subscriber,
				score: resolvedPair.score,
				sharedCount: resolvedPair.sharedCount,
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
					createdAt: new Date(r.created_at),
					kind: r.kind
				}))
			};
		} else {
			viewer = { isSelf: true, isSubscriber: false, score: null, sharedCount: 0, sharedPlaces: [] };
		}
	}

	return { profile, location, likedPlaces, likedCount, viewer };
};
