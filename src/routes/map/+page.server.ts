import { and, asc, eq, isNotNull, notInArray } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { place, userLocation } from '$lib/server/db/schema';
import { getPlaceIdsByKind } from '$lib/server/likes';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	// Center the map on the user's current location if they have one.
	let center = { latitude: 34.0522, longitude: -118.2437 };
	let likedIds: string[] = [];
	let wantToGoIds: string[] = [];
	let hiddenIds: string[] = [];

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
		// Disliked and seen are both "I'm done with this" signals - keep them
		// off the map. Want-to-go stays visible (you want to go there).
		hiddenIds = [...disliked, ...seen];
	}

	// Places with coords, excluding ones the viewer disliked or marked seen.
	const baseFilters = [isNotNull(place.latitude), isNotNull(place.longitude)];
	if (hiddenIds.length > 0) baseFilters.push(notInArray(place.id, hiddenIds));

	const places = await db
		.select()
		.from(place)
		.where(and(...baseFilters))
		.orderBy(asc(place.city), asc(place.name));

	return { places, center, likedIds, wantToGoIds };
};
