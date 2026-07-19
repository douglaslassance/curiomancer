import { and, eq, sql } from 'drizzle-orm';
import { db } from './db';
import { tuneSkip } from './db/schema';
import { haversineKm, type NearbyPlace } from './nearby';
import { AGREEMENT_EXPR, MATCH_THRESHOLD, matchScoreExpr } from './similarity';

/**
 * Tune ranking knobs. These are documented + shown live in the admin Algorithm
 * page (/admin/codex), which imports them, so keep the names and the doc
 * comments meaningful. All tunable; calibrate against real data over time.
 *
 * The score for a candidate place is:
 *
 *   proximity = 1 - distance / NEGATIVE_AT_KM        (+1 at your door, 0 at the
 *                                                      crossover, negative beyond)
 *   score     = proximity + MATCH_WEIGHT * match + POPULARITY_WEIGHT * popularity
 *
 * where `match` and `popularity` are each normalized to 0..1 across the
 * candidate set. A place is shown only if `score > 0`, so distance is a plus up
 * close and a growing minus past the crossover: a signal (match/popularity)
 * buys a place extra reach, but distance always wins in the end. A close place
 * with no signal still shows (proximity carries it), which keeps fresh/nearby
 * places discoverable; a far-but-popular place is dragged under 0 and hidden.
 */

/** Distance where proximity flips from a positive to a negative contribution. */
export const NEGATIVE_AT_KM = 15;
/** Hard stop: never gather or show a place farther than this (nothing past it
 *  can clear score > 0 anyway, given the weights below). */
export const MAX_DISTANCE_KM = 40;
/** Weight of a full taste match. 1.0 => a perfect match offsets one crossover
 *  of distance (stays visible to ~2x NEGATIVE_AT_KM). */
export const MATCH_WEIGHT = 1.0;
/** Weight of full popularity. Deliberately below MATCH_WEIGHT - a match is the
 *  stronger "you'll recognize/like it" signal than raw popularity. */
export const POPULARITY_WEIGHT = 0.5;

/** How many top twins the taste signal draws from (mirrors getRecommendedPlaces). */
export const TWIN_LIMIT = 20;

/**
 * Skip = "not now", not "never". A skipped place is hidden for a backing-off
 * cooldown, then resurfaces; after SKIP_RETIRE_COUNT skips it's retired. Days
 * are indexed by skip count (count 1 -> first entry).
 */
export const SKIP_COOLDOWN_DAYS = [14, 60];
export const SKIP_RETIRE_COUNT = 3;

/** SQL: is this skip row still suppressing its place (in cooldown or retired)? */
function skipStillActive(alias = 'ts') {
	return sql`(
		${sql.raw(alias)}.count >= ${SKIP_RETIRE_COUNT}
		OR ${sql.raw(alias)}.last_skipped_at > now() - (
			CASE WHEN ${sql.raw(alias)}.count <= 1 THEN ${`${SKIP_COOLDOWN_DAYS[0]} days`}::interval
			ELSE ${`${SKIP_COOLDOWN_DAYS[1]} days`}::interval END
		)
	)`;
}

type TuneRow = {
	id: string;
	name: string;
	category: 'eat' | 'drink' | 'shop' | 'visit';
	city: string;
	neighborhood: string | null;
	description: string;
	latitude: number | null;
	longitude: number | null;
	source: 'apple' | 'seed' | 'manual';
	external_id: string | null;
	created_at: Date;
	distance_km: number;
	taste_score: number;
	like_count: number;
};

/**
 * The ranked "rate this next" queue: places worth rating near the viewer,
 * scored by `proximity + MATCH_WEIGHT*match + POPULARITY_WEIGHT*popularity`
 * (see the constants above for the full model). Signals:
 *
 *   proximity  = 1 - distance/NEGATIVE_AT_KM   (signed: + up close, - past it)
 *   match      = sum of the viewer's twins' scores who liked the place (norm.)
 *   popularity = platform like count, log-scaled (normalized)
 *
 * Only places scoring > 0 are returned, so far + unmatched + unpopular places
 * are dropped and the queue is meant to run dry ("come back later") rather than
 * surface filler. Sorted best-first. Rated places are NOT excluded (the client
 * filters those and needs the full set to dedupe its Apple POI sweep); filtering
 * preserves the ranking, so the unrated queue stays in order.
 */
export async function getTuneQueue(
	userId: string,
	lat: number,
	lng: number
): Promise<NearbyPlace[]> {
	const distance = haversineKm(lat, lng, 'p.latitude', 'p.longitude');
	const rows = await db.execute<TuneRow>(sql`
		WITH my_relations AS (
			SELECT place_id, kind FROM "place_relation"
			WHERE user_id = ${userId} AND kind IN ('liked', 'disliked')
		),
		my_total AS (SELECT COUNT(*)::float AS n FROM my_relations),
		their_totals AS (
			SELECT user_id, COUNT(*)::float AS n
			FROM "place_relation"
			WHERE kind IN ('liked', 'disliked')
			GROUP BY user_id
		),
		pair_stats AS (
			SELECT
				theirs.user_id,
				${matchScoreExpr(
					sql`SUM(${AGREEMENT_EXPR})`,
					sql`COUNT(*)`,
					sql`(SELECT n FROM my_total)`,
					sql`tt.n`
				)} AS score
			FROM "place_relation" theirs
			JOIN my_relations mine ON mine.place_id = theirs.place_id
			JOIN their_totals tt ON tt.user_id = theirs.user_id
			WHERE theirs.user_id <> ${userId}
			  AND theirs.kind IN ('liked', 'disliked')
			  AND theirs.user_id NOT IN (
			  	SELECT blocked_id FROM "block" WHERE blocker_id = ${userId}
			  	UNION
			  	SELECT blocker_id FROM "block" WHERE blocked_id = ${userId}
			  )
			GROUP BY theirs.user_id, tt.n
		),
		twins AS (
			SELECT user_id, score
			FROM pair_stats
			WHERE score > ${MATCH_THRESHOLD}
			ORDER BY score DESC
			LIMIT ${TWIN_LIMIT}
		),
		taste AS (
			SELECT l.place_id, SUM(t.score)::float AS taste_score
			FROM "place_relation" l
			JOIN twins t ON t.user_id = l.user_id
			WHERE l.kind = 'liked'
			GROUP BY l.place_id
		),
		popularity AS (
			SELECT place_id, COUNT(*)::int AS like_count
			FROM "place_relation"
			WHERE kind = 'liked'
			GROUP BY place_id
		)
		SELECT
			p.*,
			${distance} AS distance_km,
			COALESCE(tp.taste_score, 0) AS taste_score,
			COALESCE(pop.like_count, 0) AS like_count
		FROM place p
		LEFT JOIN taste tp ON tp.place_id = p.id
		LEFT JOIN popularity pop ON pop.place_id = p.id
		WHERE p.latitude IS NOT NULL
		  AND p.longitude IS NOT NULL
		  AND ${distance} <= ${MAX_DISTANCE_KM}
		  -- Hide places the viewer skipped and that are still in cooldown/retired.
		  -- A skip may be recorded by our place id or (for a POI skipped before it
		  -- entered our DB) by Apple external id, so match either.
		  AND NOT EXISTS (
		  	SELECT 1 FROM "tune_skip" ts
		  	WHERE ts.user_id = ${userId}
		  	  AND (ts.place_id = p.id OR (ts.external_id IS NOT NULL AND ts.external_id = p.external_id))
		  	  AND ${skipStillActive('ts')}
		  )
	`);

	const candidates = rows.map((r) => ({ r, distanceKm: Number(r.distance_km) || 0 }));

	// Normalize each signal to 0..1 across the gathered set, then blend. Reduce
	// (not Math.max(...spread)) so a large nearby set can't blow the call stack.
	let maxTaste = 0;
	let maxLogPop = 0;
	for (const { r } of candidates) {
		maxTaste = Math.max(maxTaste, Number(r.taste_score) || 0);
		maxLogPop = Math.max(maxLogPop, Math.log1p(Number(r.like_count) || 0));
	}

	const scored = candidates
		.map(({ r, distanceKm }) => {
			// Signed: positive within NEGATIVE_AT_KM, negative beyond (not clamped).
			const proximity = 1 - distanceKm / NEGATIVE_AT_KM;
			const match = maxTaste > 0 ? (Number(r.taste_score) || 0) / maxTaste : 0;
			const popularity =
				maxLogPop > 0 ? Math.log1p(Number(r.like_count) || 0) / maxLogPop : 0;
			const score = proximity + MATCH_WEIGHT * match + POPULARITY_WEIGHT * popularity;
			return { r, distanceKm, score };
		})
		// Below zero = not worth rating (too far to overcome its signal). An empty
		// queue is fine - the client then shows "come back later".
		.filter(({ score }) => score > 0)
		.map(({ r, distanceKm, score }) => {
			const place: NearbyPlace = {
				id: r.id,
				name: r.name,
				category: r.category,
				city: r.city,
				neighborhood: r.neighborhood,
				description: r.description,
				latitude: r.latitude,
				longitude: r.longitude,
				source: r.source,
				externalId: r.external_id,
				createdAt: new Date(r.created_at),
				distanceKm
			};
			return { place, score };
		});

	scored.sort((a, b) => b.score - a.score);
	return scored.map((s) => s.place);
}

/**
 * Record a Tune skip, or bump an existing one's count + timestamp (which
 * lengthens its cooldown). Identify the place by our `placeId` or, for a raw
 * Apple POI not yet saved, its `externalId` (Apple muid).
 */
export async function recordTuneSkip(
	userId: string,
	ref: { placeId?: string; externalId?: string }
): Promise<void> {
	const col = ref.placeId ? tuneSkip.placeId : tuneSkip.externalId;
	const val = ref.placeId ?? ref.externalId;
	if (!val) return;

	const [existing] = await db
		.select({ id: tuneSkip.id, count: tuneSkip.count })
		.from(tuneSkip)
		.where(and(eq(tuneSkip.userId, userId), eq(col, val)))
		.limit(1);

	if (existing) {
		await db
			.update(tuneSkip)
			.set({ count: existing.count + 1, lastSkippedAt: new Date() })
			.where(eq(tuneSkip.id, existing.id));
	} else {
		await db.insert(tuneSkip).values({
			userId,
			placeId: ref.placeId ?? null,
			externalId: ref.externalId ?? null
		});
	}
}

/**
 * Apple external ids the viewer has skipped that are still in cooldown/retired,
 * so the client's Apple POI sweep can skip them across sessions (DB places are
 * already excluded server-side in getTuneQueue).
 */
export async function getSkippedExternalIds(userId: string): Promise<string[]> {
	const rows = await db.execute<{ external_id: string }>(sql`
		SELECT external_id FROM "tune_skip" ts
		WHERE ts.user_id = ${userId}
		  AND ts.external_id IS NOT NULL
		  AND ${skipStillActive('ts')}
	`);
	return rows.map((r) => r.external_id);
}
