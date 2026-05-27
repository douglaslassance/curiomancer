import { and, asc, eq, isNotNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { place, userLocation } from '$lib/server/db/schema';
import { getPlaceIdsByKind } from '$lib/server/likes';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	// Only include places with coordinates — the map can't pin the rest.
	const places = await db
		.select()
		.from(place)
		.where(and(isNotNull(place.latitude), isNotNull(place.longitude)))
		.orderBy(asc(place.city), asc(place.name));

	// Center the map on the user's current location if they have one.
	// Otherwise default to Los Angeles.
	let center = { latitude: 34.0522, longitude: -118.2437 };
	let likedIds: string[] = [];
	let dislikedIds: string[] = [];
	if (locals.user) {
		const [loc] = await db
			.select({ latitude: userLocation.latitude, longitude: userLocation.longitude })
			.from(userLocation)
			.where(eq(userLocation.userId, locals.user.id))
			.limit(1);
		if (loc) center = { latitude: loc.latitude, longitude: loc.longitude };
		const [liked, disliked] = await Promise.all([
			getPlaceIdsByKind(locals.user.id, 'liked'),
			getPlaceIdsByKind(locals.user.id, 'disliked')
		]);
		likedIds = [...liked];
		dislikedIds = [...disliked];
	}

	return { places, center, likedIds, dislikedIds };
};
