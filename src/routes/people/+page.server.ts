import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { userLocation } from '$lib/server/db/schema';
import { getPeopleNearby, type NearbyPerson } from '$lib/server/nearby';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	// Anonymous viewers can browse public profiles too, but we need a
	// reference point. If they have no location we just return empty.
	if (!locals.user) {
		return { center: null, radiusKm: 30, people: [] as NearbyPerson[], signedIn: false as const };
	}

	const [loc] = await db
		.select({ latitude: userLocation.latitude, longitude: userLocation.longitude })
		.from(userLocation)
		.where(eq(userLocation.userId, locals.user.id))
		.limit(1);

	if (!loc) {
		return { center: null, radiusKm: 30, people: [] as NearbyPerson[], signedIn: true as const };
	}

	const radiusKm = Math.max(1, Math.min(500, Number(url.searchParams.get('radius') ?? '') || 30));

	const people = await getPeopleNearby(loc.latitude, loc.longitude, radiusKm, locals.user.id);

	return {
		center: { latitude: loc.latitude, longitude: loc.longitude },
		radiusKm,
		people,
		signedIn: true as const
	};
};
