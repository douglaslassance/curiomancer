import { error } from '@sveltejs/kit';
import { asc, eq, getTableColumns, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { placeRelation, place, user, userLocation, type Place } from '$lib/server/db/schema';
import type { PageServerLoad } from './$types';

/**
 * Public profile for a Bond user.
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
			instagram: user.instagram,
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

	// Compute similarity with the viewer (if signed in and not viewing self).
	let viewer: {
		isSelf: boolean;
		score: number;
		sharedCount: number;
		sharedPlaces: Place[];
	} | null = null;

	if (locals.user) {
		const isSelf = locals.user.id === params.id;
		if (!isSelf) {
			// All places the viewer likes that this profile also likes.
			const shared = await db.execute<{
				id: string;
				name: string;
				category: 'restaurant' | 'bar' | 'shop';
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
				JOIN "place_relation" mine ON mine.place_id = p.id AND mine.user_id = ${locals.user.id}
				JOIN "place_relation" theirs ON theirs.place_id = p.id AND theirs.user_id = ${params.id}
				ORDER BY p.city, p.name
			`);

			const [{ myTotal }] = await db.execute<{ myTotal: number }>(
				sql`SELECT COUNT(*)::int AS "myTotal" FROM "place_relation" WHERE user_id = ${locals.user.id}`
			);
			const theirTotal = likedPlaces.length;
			const sharedCount = shared.length;
			const denom = myTotal + theirTotal - sharedCount;
			const score = denom > 0 ? sharedCount / denom : 0;

			viewer = {
				isSelf: false,
				score,
				sharedCount,
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
				}))
			};
		} else {
			viewer = { isSelf: true, score: 0, sharedCount: 0, sharedPlaces: [] };
		}
	}

	return { profile, location, likedPlaces, viewer };
};
