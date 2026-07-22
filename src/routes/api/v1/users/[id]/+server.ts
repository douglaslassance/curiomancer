import { asc, eq, getTableColumns } from 'drizzle-orm';
import { error, json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { place, placeRelation, user, userLocation } from '$lib/server/db/schema';
import { getPairScore } from '$lib/server/matching';
import { requireApiUser } from '$lib/server/api-auth';
import type { RequestHandler } from './$types';

/**
 * GET /api/v1/users/:id
 *
 * A public profile: what someone likes, where they are, and (relative to the
 * viewer) how strongly you match. Mirrors the /users/[id] page load.
 *
 * Privacy: unlike /api/v1/account and /home, this NEVER returns another
 * user's email, role, or exact coordinates - only city / country / timezone,
 * matching what the web profile page exposes publicly.
 *
 * Each place carries the target user's own `relation` ('liked' | 'disliked' |
 * 'seen' | 'want_to_go') so a client can tab it into Liked / Want to go /
 * Disliked, exactly like the web profile's sub-tabs. Publicly exposing these
 * matches the web profile page (which shows shared want-to-go / disliked).
 *
 *   returns: { profile, location, places: [{ ...place, relation }], viewer }
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

	const places = await db
		.select({ ...getTableColumns(place), relation: placeRelation.kind })
		.from(place)
		.innerJoin(placeRelation, eq(placeRelation.placeId, place.id))
		.where(eq(placeRelation.userId, params.id))
		.orderBy(asc(place.city), asc(place.name));

	// Viewer-relative similarity, unless the viewer is looking at themselves.
	const isSelf = viewerId === params.id;
	const viewer = isSelf
		? { isSelf: true, score: null, sharedCount: 0 }
		: { isSelf: false, ...(await getPairScore(viewerId, params.id)) };

	return json({ profile, location: location ?? null, places, viewer });
};
