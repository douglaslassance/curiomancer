import { and, eq } from 'drizzle-orm';
import { error, json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { placeRelation, place } from '$lib/server/db/schema';
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
};

/**
 * Upsert a place by (source, external_id) and like it for the current user.
 * Returns the place id so the caller can navigate to the detail page or
 * refresh the map.
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

	if (!name) throw error(400, 'name is required');
	if (!category) throw error(400, 'category is required');
	if (!city) throw error(400, 'city is required');
	if (source === 'apple' && !externalId) {
		throw error(400, 'externalId is required for source=apple');
	}

	// Dedupe: if this Apple place already exists, reuse it.
	let existingId: string | null = null;
	if (externalId) {
		const [existing] = await db
			.select({ id: place.id })
			.from(place)
			.where(and(eq(place.source, source), eq(place.externalId, externalId)))
			.limit(1);
		existingId = existing?.id ?? null;
	}

	let placeId = existingId;
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

	// Like it (idempotent).
	await db.insert(placeRelation).values({ userId: locals.user.id, placeId }).onConflictDoNothing();

	return json({ placeId });
};
