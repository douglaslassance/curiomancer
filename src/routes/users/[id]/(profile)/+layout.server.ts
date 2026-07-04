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
import type { LayoutServerLoad } from './$types';

export type SharedPlace = Place & { kind: PlaceRelationKind };

/**
 * Public profile for a Curiomancer user - shared across the Likes (default),
 * Want to go, Disliked, and Twins tabs. Public to everyone (signed in or
 * not), except a blocked pair: blocking is mutual, so the profile 404s for
 * whichever side is involved, same as if the account didn't exist. When a
 * viewer is signed in we also compute their Jaccard similarity + every place
 * where you both landed on the same stance, so the page is the natural
 * answer to "why is this person in my matches?"
 */
export const load: LayoutServerLoad = async ({ params, locals }) => {
	const [profile] = await db
		.select({
			id: user.id,
			name: user.name,
			image: user.image,
			createdAt: user.createdAt,
			messageable: user.messageable
		})
		.from(user)
		.where(eq(user.id, params.id))
		.limit(1);
	if (!profile) throw error(404, 'User not found');

	if (locals.user && locals.user.id !== params.id) {
		if (await isBlocked(locals.user.id, params.id)) throw error(404, 'User not found');
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
	const likedPlaces: SharedPlace[] = await db
		.select({ ...getTableColumns(place), kind: placeRelation.kind })
		.from(place)
		.innerJoin(placeRelation, eq(placeRelation.placeId, place.id))
		.where(eq(placeRelation.userId, params.id))
		.orderBy(asc(place.city), asc(place.name));

	// Compute similarity with the viewer (if signed in and not viewing self).
	let viewer: {
		isSelf: boolean;
		score: number | null;
		sharedCount: number;
		sharedPlaces: SharedPlace[];
	} | null = null;

	if (locals.user) {
		const isSelf = locals.user.id === params.id;
		if (!isSelf) {
			// Score comes from the shared matching helper so it can't disagree
			// with the people list. `shared` is every place where both of you
			// landed on the SAME kind (both liked, both disliked, both seen,
			// both want-to-go) - a different thing from the score's liked+
			// disliked overlap, so we still query it separately.
			const pair = await getPairScore(locals.user.id, params.id);
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
					createdAt: new Date(r.created_at),
					kind: r.kind
				}))
			};
		} else {
			viewer = { isSelf: true, score: null, sharedCount: 0, sharedPlaces: [] };
		}
	}

	return { profile, location, likedPlaces, viewer };
};
