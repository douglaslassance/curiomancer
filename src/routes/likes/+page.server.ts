import { asc, eq, getTableColumns } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { placeRelation, place } from '$lib/server/db/schema';
import type { PageServerLoad } from './$types';

/**
 * For signed-in users we return only their liked places (the canonical source).
 * For anonymous users we return all places so the client can filter by
 * localStorage IDs after hydration.
 */
export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user) {
		const rows = await db
			.select(getTableColumns(place))
			.from(place)
			.innerJoin(placeRelation, eq(placeRelation.placeId, place.id))
			.where(eq(placeRelation.userId, locals.user.id))
			.orderBy(asc(place.city), asc(place.name));
		return { places: rows, scope: 'user' as const };
	}

	const all = await db.select().from(place).orderBy(asc(place.city), asc(place.name));
	return { places: all, scope: 'anonymous' as const };
};
