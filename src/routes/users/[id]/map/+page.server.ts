import { error } from '@sveltejs/kit';
import { and, asc, eq, getTableColumns, isNotNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { place, placeRelation, user, userLocation } from '$lib/server/db/schema';
import type { PageServerLoad } from './$types';

/**
 * Another user's map: their liked places, plotted. Public like the profile
 * page it hangs off. We only plot `liked` relations with coordinates - the
 * pins represent places this person vouches for, so a viewer can explore
 * the taste of someone they match with.
 */
export const load: PageServerLoad = async ({ params }) => {
	const [profile] = await db
		.select({ id: user.id, name: user.name, image: user.image })
		.from(user)
		.where(eq(user.id, params.id))
		.limit(1);
	if (!profile) throw error(404, 'User not found');

	// Center on where they are now, falling back to LA to match /map.
	let center = { latitude: 34.0522, longitude: -118.2437 };
	const [loc] = await db
		.select({ latitude: userLocation.latitude, longitude: userLocation.longitude })
		.from(userLocation)
		.where(eq(userLocation.userId, params.id))
		.limit(1);
	if (loc) center = { latitude: loc.latitude, longitude: loc.longitude };

	// Their liked places that actually have coordinates to plot.
	const places = await db
		.select(getTableColumns(place))
		.from(place)
		.innerJoin(
			placeRelation,
			and(eq(placeRelation.placeId, place.id), eq(placeRelation.kind, 'liked'))
		)
		.where(
			and(
				eq(placeRelation.userId, params.id),
				isNotNull(place.latitude),
				isNotNull(place.longitude)
			)
		)
		.orderBy(asc(place.city), asc(place.name));

	// Every plotted place is one they like, so they all render as liked pins.
	const likedIds = places.map((p) => p.id);

	return { profile, center, places, likedIds };
};
