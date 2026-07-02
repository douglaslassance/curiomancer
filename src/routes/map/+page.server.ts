import { and, asc, eq, isNotNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { place, userLocation } from '$lib/server/db/schema';
import { getPlaceIdsByKind } from '$lib/server/likes';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	// Center the map on the user's current location if they have one.
	let center = { latitude: 34.0522, longitude: -118.2437 };
	let likedIds: string[] = [];
	let wantToGoIds: string[] = [];
	let dislikedIds: string[] = [];
	let seenIds: string[] = [];

	if (locals.user) {
		const [loc] = await db
			.select({ latitude: userLocation.latitude, longitude: userLocation.longitude })
			.from(userLocation)
			.where(eq(userLocation.userId, locals.user.id))
			.limit(1);
		if (loc) center = { latitude: loc.latitude, longitude: loc.longitude };

		const [liked, disliked, seen, wantToGo] = await Promise.all([
			getPlaceIdsByKind(locals.user.id, 'liked'),
			getPlaceIdsByKind(locals.user.id, 'disliked'),
			getPlaceIdsByKind(locals.user.id, 'seen'),
			getPlaceIdsByKind(locals.user.id, 'want_to_go')
		]);
		likedIds = [...liked];
		wantToGoIds = [...wantToGo];
		dislikedIds = [...disliked];
		seenIds = [...seen];
	}

	// All places with coords. Seen and disliked are no longer filtered out -
	// the map's filter chips control which relation categories are shown.
	const places = await db
		.select()
		.from(place)
		.where(and(isNotNull(place.latitude), isNotNull(place.longitude)))
		.orderBy(asc(place.city), asc(place.name));

	return { places, center, likedIds, wantToGoIds, dislikedIds, seenIds };
};
