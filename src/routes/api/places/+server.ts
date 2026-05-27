import { and, eq } from 'drizzle-orm';
import { error, json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { place } from '$lib/server/db/schema';
import { setRelation } from '$lib/server/likes';
import type { PlaceRelationKind } from '$lib/server/db/schema';
import type { RequestHandler } from './$types';

type AddPlaceBody = {
	externalId?: string;
	source?: 'apple' | 'manual';
	name?: string;
	category?: 'restaurant' | 'bar' | 'shop';
	city?: string;
	neighborhood?: string;
	description?: string;
	latitude?: number;
	longitude?: number;
	/** Optional relation to set in the same transaction; defaults to 'liked'. */
	kind?: PlaceRelationKind;
};

/**
 * Upsert a place by (source, external_id) and set the user's relation to it.
 * Returns the place id so the caller can navigate or refresh the map.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) throw error(401, 'Sign in to add places.');

	const body = (await request.json().catch(() => null)) as AddPlaceBody | null;
	if (!body) throw error(400, 'Invalid body');

	const name = body.name?.trim();
	const category = body.category;
	const city = body.city?.trim();
	const source = body.source ?? 'apple';
	const externalId = body.externalId?.trim();
	const kind: PlaceRelationKind = body.kind ?? 'liked';

	if (!name) throw error(400, 'name is required');
	if (!category) throw error(400, 'category is required');
	if (!city) throw error(400, 'city is required');
	if (source === 'apple' && !externalId) {
		throw error(400, 'externalId is required for source=apple');
	}
	if (kind !== 'liked' && kind !== 'disliked' && kind !== 'want_to_go') {
		throw error(400, "kind must be 'liked', 'disliked', or 'want_to_go'.");
	}

	// Dedupe: if this Apple place already exists, reuse it.
	let placeId: string | null = null;
	if (externalId) {
		const [existing] = await db
			.select({ id: place.id })
			.from(place)
			.where(and(eq(place.source, source), eq(place.externalId, externalId)))
			.limit(1);
		placeId = existing?.id ?? null;
	}

	if (!placeId) {
		const [created] = await db
			.insert(place)
			.values({
				name,
				category,
				city,
				neighborhood: body.neighborhood?.trim() || null,
				description: body.description?.trim() || `${name}, ${city}`,
				latitude: body.latitude ?? null,
				longitude: body.longitude ?? null,
				source,
				externalId: externalId ?? null
			})
			.returning({ id: place.id });
		placeId = created.id;
	}

	await setRelation(locals.user.id, placeId, kind);

	return json({ placeId, kind });
};
