import { error } from '@sveltejs/kit';
import { count, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { placeRelation, place } from '$lib/server/db/schema';
import { getPeopleWhoLikedPlace } from '$lib/server/matching';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const [row] = await db.select().from(place).where(eq(place.id, params.id)).limit(1);
	if (!row) throw error(404, 'Place not found');

	const [{ likeCount }] = await db
		.select({ likeCount: count() })
		.from(placeRelation)
		.where(eq(placeRelation.placeId, params.id));

	const likers = await getPeopleWhoLikedPlace(locals.user?.id ?? null, params.id);

	return { place: row, likeCount, likers };
};
