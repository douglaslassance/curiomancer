/**
 * Taste-matching using cosine similarity over the place_relation graph.
 *
 * Each (user, place) row is a ±1 vote: 'liked' = +1, 'disliked' = -1.
 * 'seen' and 'want_to_go' carry no taste signal and are ignored. Modeling
 * each user as a sparse ±1 vector over places, the similarity of two users
 * is the cosine of those vectors, damped by significance weighting:
 *
 *              agreements - disagreements
 *     cosine = ---------------------------------      (dot product over shared
 *              sqrt(|A opinions| * |B opinions|)        places over the product
 *                                                       of norms; each norm is
 *                                                       sqrt(count) since every
 *                                                       weight is ±1)
 *
 *     score  = cosine * min(sharedCount, N) / N        (N = SIGNIFICANCE_FLOOR)
 *
 * Unlike a plain agreement ratio, the sqrt-of-totals denominator makes your
 * non-overlapping opinions count: agreeing on 3 of your 8 places no longer
 * reads as a perfect match. The significance term then keeps a lucky
 * agreement on one or two places from reading as a strong match, damping the
 * score linearly below N shared opinions (Herlocker et al. 1999, "significance
 * weighting" for user-user collaborative filtering).
 *
 * Range is -1..+1; the UI clamps to Math.max(0, score) as a 0..100 % badge.
 *
 * Computed per-request via raw SQL. At our beta scale (hundreds of users,
 * thousands of relations) this is cheap. Migration path is a nightly job
 * that materializes a `recommendation` cache.
 */

import { sql } from 'drizzle-orm';
import { db } from './db';
import { recommendationImpression, type Place, type RecommendationReason } from './db/schema';
import { haversineKm } from './nearby';
import { AGREEMENT_EXPR, matchScoreExpr } from './similarity';

/**
 * Where to look for candidate places: an exact city match (what /places and
 * /map use - they already have their own radius-based nearby query, so this
 * just scopes recommendations to "the same city"), or a real distance
 * radius around a point (what the home dashboard uses, so a recommendation
 * a few km over a city line isn't invisible just because of an address field).
 */
export type PlaceScope =
	| { kind: 'city'; city: string }
	| { kind: 'radius'; latitude: number; longitude: number; radiusKm: number };

function placeScopeClause(scope: PlaceScope) {
	return scope.kind === 'city'
		? sql`p.city = ${scope.city}`
		: sql`${haversineKm(scope.latitude, scope.longitude, 'p.latitude', 'p.longitude')} <= ${scope.radiusKm}`;
}

export type MatchedPerson = {
	id: string;
	name: string;
	image: string | null;
	/** How many places we overlap on (any kind agreement OR disagreement). */
	sharedCount: number;
	/** -1..+1. UI typically clamps to [0, 1] when displaying as a percentage. */
	score: number;
};

export type RecommendedPlace = Place & {
	/** Sum of similarity weights from the twins who liked this place. */
	score: number;
	/** How many of your taste-twins liked it. */
	twinCount: number;
	/** Why this place was recommended - powers the admin conversion breakdown. */
	reason: RecommendationReason;
};

/**
 * Log the first time each place was recommended to a user, so the admin
 * dashboard can compute what fraction of recommendations turn into likes.
 * Unique on (userId, placeId) - duplicate dashboard loads are no-ops.
 */
export async function logRecommendationImpressions(
	userId: string,
	places: RecommendedPlace[]
): Promise<void> {
	if (places.length === 0) return;
	await db
		.insert(recommendationImpression)
		.values(places.map((p) => ({ userId, placeId: p.id, reason: p.reason })))
		.onConflictDoNothing();
}

/** How many top twins to draw place/event recommendations from. */
const TWIN_LIMIT = 20;

/**
 * Signed-similarity score between two specific users, using the exact same
 * formula as the people list (getPeopleNearby). Keeping one definition means
 * a pair's "match %" is identical wherever it's shown - profile page and
 * people list can't disagree.
 *
 * Returns score in -1..+1 (UI clamps to 0..100%) plus the number of places
 * the two overlap on. `score` is null when the viewer has no liked/disliked
 * signal to compare against, matching the people list's "no badge" behavior.
 */
export async function getPairScore(
	viewerId: string,
	targetId: string
): Promise<{ score: number | null; sharedCount: number }> {
	const [row] = await db.execute<{
		viewer_total: number;
		shared_count: number;
		score: number | null;
	}>(sql`
		WITH viewer_relations AS (
			SELECT place_id, kind FROM "place_relation"
			WHERE user_id = ${viewerId} AND kind IN ('liked', 'disliked')
		),
		target_total AS (
			SELECT COUNT(*)::float AS n FROM "place_relation"
			WHERE user_id = ${targetId} AND kind IN ('liked', 'disliked')
		)
		SELECT
			(SELECT COUNT(*)::int FROM viewer_relations) AS viewer_total,
			COUNT(*)::int AS shared_count,
			${matchScoreExpr(
				sql`SUM(${AGREEMENT_EXPR})`,
				sql`COUNT(*)`,
				sql`(SELECT COUNT(*)::float FROM viewer_relations)`,
				sql`(SELECT n FROM target_total)`
			)} AS score
		FROM "place_relation" theirs
		JOIN viewer_relations mine ON mine.place_id = theirs.place_id
		WHERE theirs.user_id = ${targetId} AND theirs.kind IN ('liked', 'disliked')
	`);

	// Null when there's nothing to compare - no viewer signal, or no overlapping
	// opinions. Matches the people list, which only badges pairs that overlap.
	if (!row || row.viewer_total === 0 || row.shared_count === 0) {
		return { score: null, sharedCount: 0 };
	}
	return { score: Number(row.score), sharedCount: row.shared_count };
}

/**
 * Top N people in `city` with the highest signed similarity to `userId`.
 * Excludes the user themselves; only considers candidates we overlap with
 * on ≥1 place (either kind).
 */
export async function getMatchedPeopleInCity(
	userId: string,
	city: string,
	limit = 12
): Promise<MatchedPerson[]> {
	const rows = await db.execute<{
		id: string;
		name: string;
		image: string | null;
		shared_count: number;
		score: number;
	}>(sql`
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
				COUNT(*)::int AS shared_count,
				SUM(${AGREEMENT_EXPR})::float AS agreement_sum
			FROM "place_relation" theirs
			JOIN my_relations mine
				ON mine.place_id = theirs.place_id
			WHERE theirs.user_id <> ${userId}
			  AND theirs.kind IN ('liked', 'disliked')
			GROUP BY theirs.user_id
		)
		SELECT
			u.id,
			u.name,
			u.image,
			ps.shared_count,
			${matchScoreExpr(
				sql`ps.agreement_sum`,
				sql`ps.shared_count`,
				sql`(SELECT n FROM my_total)`,
				sql`tt.n`
			)} AS score
		FROM pair_stats ps
		JOIN their_totals tt ON tt.user_id = ps.user_id
		JOIN "user" u ON u.id = ps.user_id
		JOIN user_location ul ON ul.user_id = ps.user_id
		WHERE ul.city = ${city}
		  AND u.id NOT IN (
		  	SELECT blocked_id FROM "block" WHERE blocker_id = ${userId}
		  	UNION
		  	SELECT blocker_id FROM "block" WHERE blocked_id = ${userId}
		  )
		ORDER BY score DESC, ps.shared_count DESC
		LIMIT ${limit}
	`);

	return rows.map((r) => ({
		id: r.id,
		name: r.name,
		image: r.image,
		sharedCount: r.shared_count,
		score: Number(r.score) || 0
	}));
}

/**
 * Taste-twins shared between two specific users A and B - someone who's a
 * positive algorithmic match to BOTH, ranked by the weaker of their two
 * scores (so a person who's a strong twin to A but only a weak one to B
 * doesn't rank as if they were a strong shared twin). Not city-scoped -
 * this is "who do we both match with," not "who's nearby."
 */
export async function getSharedTwins(
	userIdA: string,
	userIdB: string,
	limit = 12
): Promise<MatchedPerson[]> {
	const rows = await db.execute<{
		id: string;
		name: string;
		image: string | null;
		shared_count: number;
		score: number;
	}>(sql`
		WITH a_rel AS (
			SELECT place_id, kind FROM "place_relation"
			WHERE user_id = ${userIdA} AND kind IN ('liked', 'disliked')
		),
		b_rel AS (
			SELECT place_id, kind FROM "place_relation"
			WHERE user_id = ${userIdB} AND kind IN ('liked', 'disliked')
		),
		a_total AS (SELECT COUNT(*)::float AS n FROM a_rel),
		b_total AS (SELECT COUNT(*)::float AS n FROM b_rel),
		their_totals AS (
			SELECT user_id, COUNT(*)::float AS n
			FROM "place_relation"
			WHERE kind IN ('liked', 'disliked')
			GROUP BY user_id
		),
		a_scores AS (
			SELECT
				theirs.user_id,
				COUNT(*)::int AS shared_count,
				SUM(${AGREEMENT_EXPR})::float AS agreement_sum
			FROM "place_relation" theirs
			JOIN a_rel mine ON mine.place_id = theirs.place_id
			WHERE theirs.user_id NOT IN (${userIdA}, ${userIdB})
			  AND theirs.kind IN ('liked', 'disliked')
			GROUP BY theirs.user_id
			HAVING SUM(${AGREEMENT_EXPR}) > 0
		),
		b_scores AS (
			SELECT
				theirs.user_id,
				COUNT(*)::int AS shared_count,
				SUM(${AGREEMENT_EXPR})::float AS agreement_sum
			FROM "place_relation" theirs
			JOIN b_rel mine ON mine.place_id = theirs.place_id
			WHERE theirs.user_id NOT IN (${userIdA}, ${userIdB})
			  AND theirs.kind IN ('liked', 'disliked')
			GROUP BY theirs.user_id
			HAVING SUM(${AGREEMENT_EXPR}) > 0
		)
		SELECT
			u.id,
			u.name,
			u.image,
			(a.shared_count + b.shared_count) AS shared_count,
			LEAST(
				${matchScoreExpr(sql`a.agreement_sum`, sql`a.shared_count`, sql`(SELECT n FROM a_total)`, sql`tt.n`)},
				${matchScoreExpr(sql`b.agreement_sum`, sql`b.shared_count`, sql`(SELECT n FROM b_total)`, sql`tt.n`)}
			) AS score
		FROM a_scores a
		JOIN b_scores b ON b.user_id = a.user_id
		JOIN their_totals tt ON tt.user_id = a.user_id
		JOIN "user" u ON u.id = a.user_id
		WHERE u.id NOT IN (
		  	SELECT blocked_id FROM "block" WHERE blocker_id IN (${userIdA}, ${userIdB})
		  	UNION
		  	SELECT blocker_id FROM "block" WHERE blocked_id IN (${userIdA}, ${userIdB})
		  )
		ORDER BY score DESC, shared_count DESC
		LIMIT ${limit}
	`);

	return rows.map((r) => ({
		id: r.id,
		name: r.name,
		image: r.image,
		sharedCount: r.shared_count,
		score: Number(r.score) || 0
	}));
}

/**
 * Top N places within `scope` (a city or a lat/lng radius) of `category`
 * that the user's top-K taste twins liked, scored by sum of similarity
 * weight, excluding places the user already has a relation with (liked,
 * disliked, or want-to-go - we don't re-recommend places you've already
 * taken a position on).
 *
 * A twin's negative score subtracts from recommendation weight, so a place
 * loved by someone who agrees with you AND hated by someone else with the
 * same taste profile lands lower than a place loved by both. Good.
 */
export async function getRecommendedPlaces(
	userId: string,
	scope: PlaceScope,
	category: 'eat' | 'drink' | 'shop' | 'visit',
	limit = 8
): Promise<RecommendedPlace[]> {
	const rows = await db.execute<{
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
		score: number;
		twin_count: number;
	}>(sql`
		WITH my_relations AS (
			SELECT place_id, kind FROM "place_relation"
			WHERE user_id = ${userId} AND kind IN ('liked', 'disliked')
		),
		all_my_relations AS (
			SELECT place_id FROM "place_relation" WHERE user_id = ${userId}
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
			WHERE score > 0
			ORDER BY score DESC
			LIMIT ${TWIN_LIMIT}
		)
		SELECT
			p.id,
			p.name,
			p.category,
			p.city,
			p.neighborhood,
			p.description,
			p.latitude,
			p.longitude,
			p.source,
			p.external_id,
			p.created_at,
			SUM(t.score)::float AS score,
			COUNT(DISTINCT t.user_id)::int AS twin_count
		FROM "place_relation" l
		JOIN twins t ON t.user_id = l.user_id
		JOIN place p ON p.id = l.place_id
		WHERE ${placeScopeClause(scope)}
		  AND p.category = ${category}
		  AND l.kind = 'liked'
		  AND p.id NOT IN (SELECT place_id FROM all_my_relations)
		GROUP BY p.id
		ORDER BY score DESC, twin_count DESC
		LIMIT ${limit}
	`);

	return rows.map((r) => ({
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
		score: Number(r.score) || 0,
		twinCount: r.twin_count,
		reason: 'twin_match' as const
	}));
}

/**
 * Fallback when the user has no signal yet (cold start): top places within
 * `scope` by raw like count. Same shape so the UI doesn't branch.
 */
export async function getPopularPlaces(
	userId: string,
	scope: PlaceScope,
	category: 'eat' | 'drink' | 'shop' | 'visit',
	limit = 8
): Promise<RecommendedPlace[]> {
	const rows = await db.execute<{
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
		like_count: number;
	}>(sql`
		SELECT
			p.id,
			p.name,
			p.category,
			p.city,
			p.neighborhood,
			p.description,
			p.latitude,
			p.longitude,
			p.source,
			p.external_id,
			p.created_at,
			COUNT(l.id) FILTER (WHERE l.kind = 'liked')::int AS like_count
		FROM place p
		LEFT JOIN "place_relation" l ON l.place_id = p.id
		WHERE ${placeScopeClause(scope)}
		  AND p.category = ${category}
		  AND p.id NOT IN (
		  	SELECT place_id FROM "place_relation" WHERE user_id = ${userId}
		  )
		GROUP BY p.id
		ORDER BY like_count DESC, p.name ASC
		LIMIT ${limit}
	`);

	return rows.map((r) => ({
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
		score: 0,
		twinCount: r.like_count,
		reason: 'popular_fallback'
	}));
}
