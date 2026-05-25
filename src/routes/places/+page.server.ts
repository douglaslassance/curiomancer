import { asc, isNotNull, and } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { place, userLocation } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	// Only include places with coordinates — the map can't pin the rest.
	const places = await db
		.select()
		.from(place)
		.where(and(isNotNull(place.latitude), isNotNull(place.longitude)))
		.orderBy(asc(place.city), asc(place.name));

	// Center the map on the user's current location if they have one.
	// Otherwise default to Los Angeles. We could also pick the centroid of
	// the places themselves, but the user's frame is usually the right one.
	let center = { latitude: 34.0522, longitude: -118.2437 };
	if (locals.user) {
		const [loc] = await db
			.select({ latitude: userLocation.latitude, longitude: userLocation.longitude })
			.from(userLocation)
			.where(eq(userLocation.userId, locals.user.id))
			.limit(1);
		if (loc) center = { latitude: loc.latitude, longitude: loc.longitude };
	}

	return { places, center };
};
