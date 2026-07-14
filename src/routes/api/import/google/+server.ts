import { and, eq } from 'drizzle-orm';
import { error, json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { place } from '$lib/server/db/schema';
import { upsertRelation } from '$lib/server/likes';
import { searchAppleMaps, mapAppleCategory } from '$lib/server/maps-search';
import { getPostHogClient } from '$lib/server/posthog';
import type { RequestHandler } from './$types';

type ImportKind = 'liked' | 'want_to_go';
type InRow = { title?: string; kind?: ImportKind };
type RowStatus = 'imported' | 'unmatched' | 'error';

/** Rows per request. The client sends the full list in batches this size so a
 * single request stays well under any timeout and Apple isn't hammered. */
const MAX_BATCH = 40;
/** How many Apple lookups to run at once within a batch. */
const CONCURRENCY = 4;

/**
 * Resolve one Google saved-place title to an Apple place and record the
 * relation. The CSVs carry no coordinates, so this is a name-only search -
 * we take Apple's top POI hit. Returns the row's outcome for the summary.
 */
async function importRow(userId: string, title: string, kind: ImportKind): Promise<RowStatus> {
	let results;
	try {
		results = await searchAppleMaps(title, { resultTypeFilter: 'Poi' });
	} catch (err) {
		console.error(`Apple search failed for ${JSON.stringify(title)}:`, err);
		return 'error';
	}

	const hit = results[0];
	if (!hit) return 'unmatched';

	const city = hit.locality?.trim() || 'Unknown';
	// Apple sometimes returns POIs we don't have a bucket for (hotels,
	// pharmacies, ...). Default them to 'visit' rather than dropping the place.
	const category = mapAppleCategory(hit.poiCategory) ?? 'visit';

	// Dedupe across all users by Apple muid. Reuse the row if it exists.
	let placeId: string | null = null;
	const [existing] = await db
		.select({ id: place.id })
		.from(place)
		.where(and(eq(place.source, 'apple'), eq(place.externalId, hit.muid)))
		.limit(1);
	placeId = existing?.id ?? null;

	if (!placeId) {
		try {
			const [created] = await db
				.insert(place)
				.values({
					name: hit.name,
					category,
					city,
					description: `${hit.name}, ${city}`,
					latitude: hit.latitude,
					longitude: hit.longitude,
					source: 'apple',
					externalId: hit.muid
				})
				.returning({ id: place.id });
			placeId = created.id;
		} catch {
			// A concurrent row in this same batch may have inserted the same
			// muid; fall back to the existing row.
			const [raced] = await db
				.select({ id: place.id })
				.from(place)
				.where(and(eq(place.source, 'apple'), eq(place.externalId, hit.muid)))
				.limit(1);
			if (!raced) return 'error';
			placeId = raced.id;
		}
	}

	await upsertRelation(userId, placeId, kind);
	return 'imported';
}

/**
 * Resolve a batch of Google saved places and write the relations. Insert-only
 * and idempotent: places dedupe by Apple muid and relations upsert, so
 * re-running (or retrying a failed batch) never duplicates or clears anything.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) throw error(401, 'Sign in to import places.');
	const userId = locals.user.id;

	const body = (await request.json().catch(() => null)) as { rows?: InRow[] } | null;
	const rows = body?.rows;
	if (!Array.isArray(rows)) throw error(400, 'rows must be an array');
	if (rows.length > MAX_BATCH) throw error(400, `Send at most ${MAX_BATCH} rows per request.`);

	const clean = rows
		.map((r) => ({ title: r.title?.trim() ?? '', kind: r.kind }))
		.filter(
			(r): r is { title: string; kind: ImportKind } =>
				r.title.length > 0 && (r.kind === 'liked' || r.kind === 'want_to_go')
		);

	const statuses: RowStatus[] = new Array(clean.length);
	let next = 0;
	async function worker() {
		while (next < clean.length) {
			const i = next++;
			statuses[i] = await importRow(userId, clean[i].title, clean[i].kind);
		}
	}
	await Promise.all(Array.from({ length: Math.min(CONCURRENCY, clean.length) }, worker));

	const results = clean.map((r, i) => ({ title: r.title, kind: r.kind, status: statuses[i] }));
	const imported = results.filter((r) => r.status === 'imported').length;

	if (imported > 0) {
		getPostHogClient()?.capture({
			distinctId: userId,
			event: 'google_import_batch',
			properties: {
				imported,
				unmatched: results.filter((r) => r.status === 'unmatched').length,
				errored: results.filter((r) => r.status === 'error').length
			}
		});
	}

	return json({ results });
};
