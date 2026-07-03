import { error, json } from '@sveltejs/kit';
import { and, count, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { place, placeRelation } from '$lib/server/db/schema';
import { getPeopleWhoLikedPlace } from '$lib/server/matching';
import { requireApiUser } from '$lib/server/api-auth';
import type { RequestHandler } from './$types';

/**
 * GET /api/v1/places/:id
 *
 * A single place with its social proof: total like count, the taste-twins who
 * liked it (viewer-relative ordering), and the viewer's own relation. Mirrors
 * the /places/[id] page load.
 *
 *   returns: { place, likeCount, likers, relation }
 */
export const GET: RequestHandler = async ({ request, params }) => {
	const userId = await requireApiUser(request);

	const [row] = await db.select().from(place).where(eq(place.id, params.id)).limit(1);
	if (!row) throw error(404, 'Place not found');

	const [[{ likeCount }], likers, [mine]] = await Promise.all([
		db
			.select({ likeCount: count() })
			.from(placeRelation)
			.where(eq(placeRelation.placeId, params.id)),
		getPeopleWhoLikedPlace(userId, params.id),
		db
			.select({ kind: placeRelation.kind })
			.from(placeRelation)
			.where(and(eq(placeRelation.userId, userId), eq(placeRelation.placeId, params.id)))
			.limit(1)
	]);

	return json({ place: row, likeCount, likers, relation: mine?.kind ?? null });
};
