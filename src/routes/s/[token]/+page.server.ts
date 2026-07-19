import { error } from '@sveltejs/kit';
import { and, asc, eq, getTableColumns, isNotNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { place, placeRelation, user, userLocation } from '$lib/server/db/schema';
import { isBlocked } from '$lib/server/blocks';
import { getPlaceIdsByKind } from '$lib/server/likes';
import { getUserIdByMapShareToken } from '$lib/server/map-share';
import type { PageServerLoad } from './$types';

/**
 * Public "share my likes" map, reached via an unguessable capability token
 * rather than the owner's user id. Anyone with the link can view it (no
 * sign-in), which is what makes rich link previews work; the token can't be
 * guessed, so the map isn't discoverable by enumerating user ids.
 */
export const load: PageServerLoad = async ({ params, locals }) => {
	const ownerId = await getUserIdByMapShareToken(params.token);
	if (!ownerId) throw error(404, 'This link is not valid.');

	const [profile] = await db
		.select({ id: user.id, name: user.name })
		.from(user)
		.where(eq(user.id, ownerId))
		.limit(1);
	if (!profile) throw error(404, 'This link is not valid.');

	// A signed-in viewer on either side of a block can't see the map.
	if (locals.user && locals.user.id !== ownerId && (await isBlocked(locals.user.id, ownerId))) {
		throw error(404, 'This link is not valid.');
	}

	const [loc] = await db
		.select({ latitude: userLocation.latitude, longitude: userLocation.longitude })
		.from(userLocation)
		.where(eq(userLocation.userId, ownerId))
		.limit(1);

	const places = await db
		.select({ ...getTableColumns(place) })
		.from(place)
		.innerJoin(placeRelation, eq(placeRelation.placeId, place.id))
		.where(
			and(
				eq(placeRelation.userId, ownerId),
				eq(placeRelation.kind, 'liked'),
				isNotNull(place.latitude),
				isNotNull(place.longitude)
			)
		)
		.orderBy(asc(place.city), asc(place.name));

	// The owner's likes render as recommendations to the viewer, except any the
	// viewer already has their own stance on (MapView's relationOf() checks the
	// viewer's sets first). Anonymous viewers have empty sets, so everything
	// simply shows as the owner's liked pins.
	const recommendedScores = Object.fromEntries(places.map((p) => [p.id, 1]));

	let likedIds: string[] = [];
	let dislikedIds: string[] = [];
	let seenIds: string[] = [];
	let wantToGoIds: string[] = [];
	if (locals.user) {
		const [liked, disliked, seen, wantToGo] = await Promise.all([
			getPlaceIdsByKind(locals.user.id, 'liked'),
			getPlaceIdsByKind(locals.user.id, 'disliked'),
			getPlaceIdsByKind(locals.user.id, 'seen'),
			getPlaceIdsByKind(locals.user.id, 'want_to_go')
		]);
		likedIds = [...liked];
		dislikedIds = [...disliked];
		seenIds = [...seen];
		wantToGoIds = [...wantToGo];
	}

	// A signed-in viewer with a known location: frame the map where THEY are, so
	// the owner's pins sit in the context of their own city (same as /places).
	const [viewerLoc] = locals.user
		? await db
				.select({ latitude: userLocation.latitude, longitude: userLocation.longitude })
				.from(userLocation)
				.where(eq(userLocation.userId, locals.user.id))
				.limit(1)
		: [undefined];

	// Center + framing. With a viewer location, center on it. Otherwise (e.g. an
	// anonymous share recipient) fit the camera to every pin - a globe-spanning
	// set has an oceanic centroid, so `frameAllPlaces` tells the client to frame
	// the bounding region of all pins instead of centering. `center` is then just
	// a placeholder the client overrides. With no pins either, fall back to the
	// owner's coarsened (~11km) location, then a default. Never expose the owner's
	// exact home coordinates.
	const coarsen = (n: number) => Math.round(n * 10) / 10;
	let center: { latitude: number; longitude: number };
	let frameAllPlaces = false;
	if (viewerLoc) {
		center = { latitude: viewerLoc.latitude, longitude: viewerLoc.longitude };
	} else if (places.length > 0) {
		center = {
			latitude: places.reduce((sum, p) => sum + p.latitude!, 0) / places.length,
			longitude: places.reduce((sum, p) => sum + p.longitude!, 0) / places.length
		};
		frameAllPlaces = true;
	} else if (loc) {
		center = { latitude: coarsen(loc.latitude), longitude: coarsen(loc.longitude) };
	} else {
		center = { latitude: 34.0522, longitude: -118.2437 };
	}

	const likedCount = places.length;
	return {
		profile,
		center,
		frameAllPlaces,
		places,
		recommendedScores,
		likedIds,
		wantToGoIds,
		dislikedIds,
		seenIds,
		signedIn: !!locals.user,
		likedCount,
		// Rich-link preview for the share link; the root layout renders it.
		meta: {
			title: `${profile.name}'s likes`,
			description: `${likedCount} ${likedCount === 1 ? 'place' : 'places'} ${profile.name} loves on Curiomancer.`
		}
	};
};
