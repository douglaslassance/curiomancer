import { and, eq } from 'drizzle-orm';
import { error, json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { place } from '$lib/server/db/schema';
import { upsertRelation } from '$lib/server/likes';
import { getPostHogClient } from '$lib/server/posthog';
import type { PlaceRelationKind } from '$lib/server/db/schema';
import type { RequestHandler } from './$types';

const KINDS: PlaceRelationKind[] = ['liked', 'disliked', 'seen', 'want_to_go'];
const CATEGORIES = ['eat', 'drink', 'shop', 'visit'] as const;

type InRating = Record<string, unknown>;

/**
 * Import ratings from a Curiomancer export (see /api/ratings/export). Each entry
 * is resolved to a place - by our id if it still exists, else by Apple external
 * id, else created from its fields - and the relation is upserted (idempotent,
 * so re-importing the same file is safe).
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) throw error(401, 'Sign in to import ratings.');

	const body = (await request.json().catch(() => null)) as { ratings?: unknown } | null;
	const rows = Array.isArray(body?.ratings) ? (body!.ratings as InRating[]) : null;
	if (!rows) throw error(400, 'Expected a Curiomancer export with a "ratings" array.');

	let imported = 0;
	let skipped = 0;

	for (const r of rows) {
		const kind = r.kind as PlaceRelationKind;
		if (!KINDS.includes(kind)) {
			skipped++;
			continue;
		}

		const placeId = await resolvePlace(r);
		if (!placeId) {
			skipped++;
			continue;
		}
		await upsertRelation(locals.user.id, placeId, kind);
		imported++;
	}

	getPostHogClient()?.capture({
		distinctId: locals.user.id,
		event: 'ratings_imported',
		properties: { imported, skipped, total: rows.length }
	});

	return json({ imported, skipped, total: rows.length });
};

/** Find or create the place for an export entry; null if there's nothing usable. */
async function resolvePlace(r: InRating): Promise<string | null> {
	const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
	const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

	// 1. Our own place id, if this export came back to the same DB.
	const placeId = str(r.placeId);
	if (placeId) {
		const [hit] = await db.select({ id: place.id }).from(place).where(eq(place.id, placeId)).limit(1);
		if (hit) return hit.id;
	}

	const source = r.source === 'apple' || r.source === 'seed' || r.source === 'manual' ? r.source : 'manual';
	const externalId = str(r.externalId);

	// 2. An existing place matched by Apple external id.
	if (externalId) {
		const [hit] = await db
			.select({ id: place.id })
			.from(place)
			.where(and(eq(place.source, source), eq(place.externalId, externalId)))
			.limit(1);
		if (hit) return hit.id;
	}

	// 3. Create from the entry's fields (needs at least name + category + city).
	const name = str(r.name);
	const city = str(r.city);
	const category = CATEGORIES.includes(r.category as (typeof CATEGORIES)[number])
		? (r.category as (typeof CATEGORIES)[number])
		: null;
	if (!name || !city || !category) return null;

	const [created] = await db
		.insert(place)
		.values({
			name,
			category,
			city,
			neighborhood: str(r.neighborhood),
			description: `${name}, ${city}`,
			latitude: num(r.latitude),
			longitude: num(r.longitude),
			source: externalId ? source : 'manual',
			externalId
		})
		.returning({ id: place.id });
	return created.id;
}
