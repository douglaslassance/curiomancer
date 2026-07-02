import { error, json } from '@sveltejs/kit';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { authenticateToken } from '$lib/server/api-tokens';
import { place, placeRelation, user, userLocation } from '$lib/server/db/schema';
import type { RequestHandler } from './$types';

/**
 * GET /api/v1/me
 *
 * Returns the authenticated user's taste: profile, current location, and
 * the places they like. Authenticate with a personal access token created
 * in Settings:
 *
 *   curl https://curiomancer.com/api/v1/me \
 *     -H "Authorization: Bearer crmc_…"
 *
 * This is the "take your taste anywhere" surface - read-only for now.
 */
export const GET: RequestHandler = async ({ request }) => {
	const userId = await authenticateToken(request.headers.get('authorization'));
	if (!userId) {
		throw error(401, 'Provide a valid token: Authorization: Bearer <token>');
	}

	const [profile, [location], likes] = await Promise.all([
		db
			.select({ id: user.id, name: user.name })
			.from(user)
			.where(eq(user.id, userId))
			.limit(1)
			.then((rows) => rows[0]),
		db
			.select({ city: userLocation.city, countryCode: userLocation.countryCode })
			.from(userLocation)
			.where(eq(userLocation.userId, userId))
			.limit(1),
		db
			.select({
				id: place.id,
				name: place.name,
				category: place.category,
				city: place.city,
				neighborhood: place.neighborhood
			})
			.from(place)
			.innerJoin(placeRelation, eq(placeRelation.placeId, place.id))
			.where(and(eq(placeRelation.userId, userId), eq(placeRelation.kind, 'liked')))
			.orderBy(asc(place.city), asc(place.name))
	]);

	return json({ user: profile, location: location ?? null, likes });
};
