import { error, redirect } from '@sveltejs/kit';
import { and, asc, eq, getTableColumns, isNotNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { place, placeRelation, user, userLocation } from '$lib/server/db/schema';
import { isBlocked } from '$lib/server/blocks';
import { getPlaceIdsByKind } from '$lib/server/likes';
import type { PageServerLoad } from './$types';

/**
 * The page a "Share my likes" link points to: a read-only map of one user's
 * liked places. Unlike the rest of the public profile, this is gated behind
 * sign-in - a visitor without a Curiomancer account is sent to /sign-in
 * (which offers sign-up, and sign-up offers the waitlist) before they can
 * see anything here.
 */
export const load: PageServerLoad = async ({ params, locals, url }) => {
	if (!locals.user) {
		throw redirect(302, `/sign-in?next=${encodeURIComponent(url.pathname)}`);
	}

	const [profile] = await db
		.select({ id: user.id, name: user.name })
		.from(user)
		.where(eq(user.id, params.id))
		.limit(1);
	if (!profile) throw error(404, 'User not found');

	if (locals.user.id !== params.id && (await isBlocked(locals.user.id, params.id))) {
		throw error(404, 'User not found');
	}

	const [loc] = await db
		.select({ latitude: userLocation.latitude, longitude: userLocation.longitude })
		.from(userLocation)
		.where(eq(userLocation.userId, params.id))
		.limit(1);

	const places = await db
		.select({ ...getTableColumns(place) })
		.from(place)
		.innerJoin(placeRelation, eq(placeRelation.placeId, place.id))
		.where(
			and(
				eq(placeRelation.userId, params.id),
				eq(placeRelation.kind, 'liked'),
				isNotNull(place.latitude),
				isNotNull(place.longitude)
			)
		)
		.orderBy(asc(place.city), asc(place.name));

	// Their likes show as recommendations to the viewer, except any the viewer
	// already has their own stance on - MapView's relationOf() checks the
	// viewer's own liked/wantToGo/disliked/seen sets before falling back to
	// recommended, so their own rating always wins over the recommendation.
	const recommendedScores = Object.fromEntries(places.map((p) => [p.id, 1]));
	const [liked, disliked, seen, wantToGo] = await Promise.all([
		getPlaceIdsByKind(locals.user.id, 'liked'),
		getPlaceIdsByKind(locals.user.id, 'disliked'),
		getPlaceIdsByKind(locals.user.id, 'seen'),
		getPlaceIdsByKind(locals.user.id, 'want_to_go')
	]);

	// Never expose the user's exact home coordinates: everywhere else the app
	// deliberately shows only city-level location. Frame the map on the centroid
	// of their liked places (already returned above, so nothing new leaks), and
	// only if they have none, fall back to a coarsened (~11km grid) version of
	// their stored location, then a default.
	const coarsen = (n: number) => Math.round(n * 10) / 10;
	const located = places.filter((p) => p.latitude != null && p.longitude != null);
	let center: { latitude: number; longitude: number };
	if (located.length > 0) {
		center = {
			latitude: located.reduce((sum, p) => sum + p.latitude!, 0) / located.length,
			longitude: located.reduce((sum, p) => sum + p.longitude!, 0) / located.length
		};
	} else if (loc) {
		center = { latitude: coarsen(loc.latitude), longitude: coarsen(loc.longitude) };
	} else {
		center = { latitude: 34.0522, longitude: -118.2437 };
	}

	return {
		profile,
		center,
		places,
		recommendedScores,
		likedIds: [...liked],
		wantToGoIds: [...wantToGo],
		dislikedIds: [...disliked],
		seenIds: [...seen]
	};
};
