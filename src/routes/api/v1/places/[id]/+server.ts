import { error, json } from '@sveltejs/kit';
import { and, count, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { place, placeRelation } from '$lib/server/db/schema';
import { requireApiUser } from '$lib/server/api-auth';
import type { RequestHandler } from './$types';

/**
 * GET /api/v1/places/:id
 *
 * A single place with a bare like count and the viewer's own relation.
 * Deliberately doesn't return WHO liked it - that named social proof made it
 * too easy to spot a specific person's taste behind a recommendation and
 * game your own likes to raise your match with them.
 *
 *   returns: { place, likeCount, relation }
 */
export const GET: RequestHandler = async ({ request, params }) => {
	const userId = await requireApiUser(request);

	const [row] = await db.select().from(place).where(eq(place.id, params.id)).limit(1);
	if (!row) throw error(404, 'Place not found');

	const [[{ likeCount }], [mine]] = await Promise.all([
		db
			.select({ likeCount: count() })
			.from(placeRelation)
			.where(eq(placeRelation.placeId, params.id)),
		db
			.select({ kind: placeRelation.kind })
			.from(placeRelation)
			.where(and(eq(placeRelation.userId, userId), eq(placeRelation.placeId, params.id)))
			.limit(1)
	]);

	return json({ place: row, likeCount, relation: mine?.kind ?? null });
};
