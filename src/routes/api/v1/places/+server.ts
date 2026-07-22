import { json } from '@sveltejs/kit';
import { requireApiUser } from '$lib/server/api-auth';
import { getRelationMap } from '$lib/server/likes';
import { getMappablePlaces } from '$lib/server/places';
import { getUserLocation } from '$lib/server/current-location';
import type { RequestHandler } from './$types';

/**
 * GET /api/v1/places
 *
 * Every place with coordinates, annotated with the viewer's relation and its
 * distance from a center point. This is the map layer: it returns all cities,
 * not just nearby ones, so a viewer in LA still sees their Tokyo pins. The
 * client filters by radius or category locally.
 *
 * Center defaults to the viewer's saved location; override with ?lat=&lng=.
 * Optional ?category=eat,drink narrows the set server-side.
 *
 *   returns: { center, places: [{ ...place, distanceKm, relation }] }
 */
const CATEGORIES = ['eat', 'drink', 'shop', 'visit'] as const;
type Category = (typeof CATEGORIES)[number];

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
	const R = 6371;
	const toRad = Math.PI / 180;
	const dLat = (bLat - aLat) * toRad;
	const dLng = (bLng - aLng) * toRad;
	const s =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(aLat * toRad) * Math.cos(bLat * toRad) * Math.sin(dLng / 2) ** 2;
	return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

export const GET: RequestHandler = async ({ request, url }) => {
	const userId = await requireApiUser(request);

	const qLat = Number(url.searchParams.get('lat'));
	const qLng = Number(url.searchParams.get('lng'));
	let center: { latitude: number; longitude: number } | null =
		isFinite(qLat) && isFinite(qLng) && url.searchParams.has('lat')
			? { latitude: qLat, longitude: qLng }
			: null;

	if (!center) {
		const loc = await getUserLocation(userId);
		if (loc) center = { latitude: loc.latitude, longitude: loc.longitude };
	}

	// Optional category filter, e.g. ?category=eat,drink.
	const categoryParam = url.searchParams.get('category');
	const categories = categoryParam
		? new Set(
				categoryParam
					.split(',')
					.map((c) => c.trim().toLowerCase())
					.filter((c): c is Category => (CATEGORIES as readonly string[]).includes(c))
			)
		: null;

	const [rows, relationMap] = await Promise.all([getMappablePlaces(), getRelationMap(userId)]);

	let places = rows
		.filter((p) => !categories || categories.has(p.category))
		.map((p) => ({
			...p,
			relation: relationMap[p.id] ?? null,
			distanceKm:
				center && p.latitude != null && p.longitude != null
					? haversineKm(center.latitude, center.longitude, p.latitude, p.longitude)
					: null
		}));

	// Closest first when we have a center; otherwise keep the city/name order.
	if (center) {
		places = places.sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
	}

	return json({ center, places });
};
