import { and, eq } from 'drizzle-orm';
import { error, json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { place } from '$lib/server/db/schema';
import { upsertRelation } from '$lib/server/likes';
import { searchAppleMaps, mapAppleCategory } from '$lib/server/maps-search';
import { getPostHogClient } from '$lib/server/posthog';
import type { RequestHandler } from './$types';

type ImportKind = 'liked' | 'want_to_go';

/**
 * The import runs in two phases so we can disambiguate by location:
 *  - `resolve`: turn each title into its top Apple candidates (no writes). The
 *    client gathers these across the whole list, infers the user's home
 *    regions, and picks the right candidate per row.
 *  - `commit`: take the chosen candidates and write place rows + relations.
 * A single title-only Apple search can't tell the LA "Paradiso" from the Paris
 * one; the client's cross-list clustering (see google-import.ts) is what does.
 */

type ResolveIn = { title?: string; kind?: ImportKind; latitude?: number; longitude?: number };
type Candidate = {
	muid: string;
	name: string;
	city: string;
	latitude: number;
	longitude: number;
	category: string;
};

type CommitIn = {
	muid?: string;
	name?: string;
	city?: string;
	latitude?: number;
	longitude?: number;
	category?: string;
	kind?: ImportKind;
};
type CommitStatus = 'imported' | 'error';

/** Our place-category enum; client-supplied values are coerced to these. */
const CATEGORIES = ['eat', 'drink', 'shop', 'visit'] as const;
type PlaceCategory = (typeof CATEGORIES)[number];
function toCategory(v: string | undefined): PlaceCategory {
	return CATEGORIES.includes(v as PlaceCategory) ? (v as PlaceCategory) : 'visit';
}

/** Rows per request, keeping each call well under any timeout. */
const MAX_BATCH = 40;
/** Concurrent Apple lookups within a resolve batch. */
const CONCURRENCY = 4;
/** How many Apple candidates to keep per title for the client to choose from. */
const CANDIDATES_PER_TITLE = 5;

/** Resolve one title to its top Apple candidates (no writes). */
async function resolveTitle(title: string): Promise<Candidate[]> {
	const results = await searchAppleMaps(title, { resultTypeFilter: 'Poi' });
	return results.slice(0, CANDIDATES_PER_TITLE).map((r) => ({
		muid: r.muid,
		name: r.name,
		city: r.locality?.trim() || 'Unknown',
		latitude: r.latitude,
		longitude: r.longitude,
		// Apple sometimes returns POIs we don't bucket (hotels, ...); default to
		// 'visit' rather than dropping the place.
		category: mapAppleCategory(r.poiCategory) ?? 'visit'
	}));
}

/** Upsert the chosen place (dedupe by Apple muid) and record the relation. */
async function commitRow(userId: string, row: CommitIn): Promise<CommitStatus> {
	const muid = row.muid?.trim();
	const kind = row.kind;
	if (!muid || (kind !== 'liked' && kind !== 'want_to_go')) return 'error';
	if (typeof row.latitude !== 'number' || typeof row.longitude !== 'number') return 'error';

	// Dedupe across all users by muid. Reuse the existing row rather than trust
	// the client's fields, so a bad payload can't overwrite a shared place.
	let placeId: string | null = null;
	const [existing] = await db
		.select({ id: place.id })
		.from(place)
		.where(and(eq(place.source, 'apple'), eq(place.externalId, muid)))
		.limit(1);
	placeId = existing?.id ?? null;

	if (!placeId) {
		const name = row.name?.trim() || '(unnamed)';
		const city = row.city?.trim() || 'Unknown';
		try {
			const [created] = await db
				.insert(place)
				.values({
					name,
					category: toCategory(row.category),
					city,
					description: `${name}, ${city}`,
					latitude: row.latitude,
					longitude: row.longitude,
					source: 'apple',
					externalId: muid
				})
				.returning({ id: place.id });
			placeId = created.id;
		} catch {
			// A concurrent row in this same batch may have inserted the same muid.
			const [raced] = await db
				.select({ id: place.id })
				.from(place)
				.where(and(eq(place.source, 'apple'), eq(place.externalId, muid)))
				.limit(1);
			if (!raced) return 'error';
			placeId = raced.id;
		}
	}

	await upsertRelation(userId, placeId, kind);
	return 'imported';
}

/** Run `task` over `items` with a fixed concurrency, preserving order. */
async function mapWithConcurrency<T, R>(
	items: T[],
	limit: number,
	task: (item: T, index: number) => Promise<R>
): Promise<R[]> {
	const out: R[] = new Array(items.length);
	let next = 0;
	async function worker() {
		while (next < items.length) {
			const i = next++;
			out[i] = await task(items[i], i);
		}
	}
	await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
	return out;
}

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) throw error(401, 'Sign in to import places.');
	const userId = locals.user.id;

	const body = (await request.json().catch(() => null)) as {
		phase?: 'resolve' | 'commit';
		rows?: unknown[];
	} | null;
	const phase = body?.phase;
	const rows = body?.rows;
	if (!Array.isArray(rows)) throw error(400, 'rows must be an array');
	if (rows.length > MAX_BATCH) throw error(400, `Send at most ${MAX_BATCH} rows per request.`);

	if (phase === 'resolve') {
		const clean = (rows as ResolveIn[])
			.map((r) => ({
				title: r.title?.trim() ?? '',
				kind: r.kind,
				latitude: typeof r.latitude === 'number' ? r.latitude : undefined,
				longitude: typeof r.longitude === 'number' ? r.longitude : undefined
			}))
			.filter((r) => r.title.length > 0 && (r.kind === 'liked' || r.kind === 'want_to_go'));

		const results = await mapWithConcurrency(clean, CONCURRENCY, async (r) => {
			try {
				return {
					title: r.title,
					kind: r.kind,
					latitude: r.latitude,
					longitude: r.longitude,
					candidates: await resolveTitle(r.title)
				};
			} catch (err) {
				console.error(`Apple resolve failed for ${JSON.stringify(r.title)}:`, err);
				return {
					title: r.title,
					kind: r.kind,
					latitude: r.latitude,
					longitude: r.longitude,
					candidates: [] as Candidate[]
				};
			}
		});
		return json({ results });
	}

	if (phase === 'commit') {
		const statuses = await mapWithConcurrency(rows as CommitIn[], CONCURRENCY, (r) =>
			commitRow(userId, r)
		);
		const imported = statuses.filter((s) => s === 'imported').length;
		if (imported > 0) {
			getPostHogClient()?.capture({
				distinctId: userId,
				event: 'google_import_commit',
				properties: { imported, errored: statuses.length - imported }
			});
		}
		return json({ results: statuses.map((status) => ({ status })) });
	}

	throw error(400, "phase must be 'resolve' or 'commit'");
};
