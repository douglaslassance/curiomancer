import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { userLocation } from '$lib/server/db/schema';
import { getPeopleNearby, MAX_RADIUS_KM, type NearbyPerson } from '$lib/server/nearby';
import { MATCH_THRESHOLD } from '$lib/server/similarity';
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

	const radiusKm = Math.max(
		5,
		Math.min(MAX_RADIUS_KM, Number(url.searchParams.get('radius') ?? '') || 30)
	);

	// Surface genuine taste-twins: cosine similarity clearing MATCH_THRESHOLD.
	const people = (
		await getPeopleNearby(loc.latitude, loc.longitude, radiusKm, locals.user.id)
	).filter((p) => p.score !== null && p.score > MATCH_THRESHOLD);

	return {
		center: { latitude: loc.latitude, longitude: loc.longitude },
		radiusKm,
		people,
		signedIn: true as const
	};
};
