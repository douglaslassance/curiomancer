import { asc, eq, inArray } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { like, place, type Place } from '$lib/server/db/schema';
import type { PageServerLoad } from './$types';

/**
 * For signed-in users we return only their liked places (the canonical source).
 * For anonymous users we return all places so the client can filter by
 * localStorage IDs after hydration.
 */
export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user) {
		const rows: Place[] = await db
			.select({
				id: place.id,
				name: place.name,
				category: place.category,
				city: place.city,
				neighborhood: place.neighborhood,
				description: place.description,
				createdAt: place.createdAt
			})
			.from(place)
			.innerJoin(like, eq(like.placeId, place.id))
			.where(eq(like.userId, locals.user.id))
			.orderBy(asc(place.city), asc(place.name));
		return { places: rows, scope: 'user' as const };
	}

	const all = await db.select().from(place).orderBy(asc(place.city), asc(place.name));
	return { places: all, scope: 'anonymous' as const };
};

// Silence unused-warning if inArray ever becomes useful here.
void inArray;
