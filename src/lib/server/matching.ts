/**
 * Taste-matching using signed similarity over the place_relation graph.
 *
 * We treat each (user, place) row as a ±1 vote: 'liked' = +1, 'disliked' = -1,
 * 'want_to_go' = ignored (it's a wishlist marker, not a taste signal).
 * Similarity between two users is then:
 *
 *     score(A, B) = agreements − disagreements
 *                  -----------------------------
 *                       |places A and B both have an opinion on|
 *
 * Agreement means both rows have the same kind on the same place (both
 * liked OR both disliked); disagreement means opposite kinds. Range is
 * −1..+1; we display Math.max(0, score) as a 0..100 % match badge.
 *
 * Why this shape:
 *  - Pure Jaccard over likes only sees positive signal.
 *  - Cosine on ±1 vectors does roughly the same thing but punishes sparse
 *    overlap (both have an opinion on only 1 place but agree) less than
 *    Jaccard does. The denominator above keeps the same dampening Jaccard
 *    had - you need to overlap on multiple places to get a high score.
 *
 * Computed per-request via raw SQL. At our beta scale (hundreds of users,
 * thousands of relations) this is cheap. Migration path is a nightly job
 * that materializes a `recommendation` cache.
 */

import { sql } from 'drizzle-orm';
import { db } from './db';
import type { Place } from './db/schema';

export type MatchedPerson = {
	id: string;
	name: string;
	image: string | null;
	/** How many places we overlap on (any kind agreement OR disagreement). */
	sharedCount: number;
	/** −1..+1. UI typically clamps to [0, 1] when displaying as a percentage. */
	score: number;
};

export type RecommendedPlace = Place & {
	/** Sum of similarity weights from the twins who liked this place. */
	score: number;
	/** How many of your taste-twins liked it. */
	twinCount: number;
};

/** How many top twins to draw place/event recommendations from. */
const TWIN_LIMIT = 20;

/**
 * Weight given to a followed user in the recommendation pool, regardless
 * of their algorithmic taste-similarity. Set well above realistic Jaccard
 * scores (which top out around 0.5) so a single followed person liking a
 * place lifts it above algorithmic-only suggestions. If a followee is
 * also a strong algorithmic twin, MAX() with their natural score wins.
 */
const FOLLOW_WEIGHT = 10;

/**
 * SQL fragment that, joined twice (alias `mine` for the viewer, `theirs`
 * for the candidate), produces `agreement` (+1/-1) for each overlapping
 * place. Encapsulated so we can drop dislikes into more queries later.
 *
 *   sum(agreement) = (agreements) − (disagreements)
 *   count(*)       = (overlapping opinions)
 */
const AGREEMENT_EXPR = sql`
	CASE
		WHEN mine.kind = theirs.kind THEN 1
		ELSE -1
	END
`;

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
		pair_stats AS (
			SELECT
				theirs.user_id,
				COUNT(*)::int AS shared_count,
				SUM(${AGREEMENT_EXPR})::float / COUNT(*)::float AS score
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
			ps.score
		FROM pair_stats ps
		JOIN "user" u ON u.id = ps.user_id
		JOIN user_location ul ON ul.user_id = ps.user_id
		WHERE ul.city = ${city}
		ORDER BY ps.score DESC, ps.shared_count DESC
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
 * Everyone who has liked `placeId`, ranked by their signed similarity to
 * `userId`. This is the "why was this recommended to me" view - shown on
 * a place's detail page so users can see who's vouching for it. Disliked
 * rows on this place are deliberately excluded (we don't show "this place
 * was disliked by people who share your taste" - that's its own surface).
 */
export async function getPeopleWhoLikedPlace(
	userId: string | null,
	placeId: string,
	limit = 24
): Promise<MatchedPerson[]> {
	const rows = await db.execute<{
		id: string;
		name: string;
		image: string | null;
		shared_count: number;
		score: number | null;
	}>(sql`
		WITH my_relations AS (
			SELECT place_id, kind FROM "place_relation"
			WHERE user_id = ${userId ?? ''} AND kind IN ('liked', 'disliked')
		),
		likers AS (
			SELECT user_id, created_at
			FROM "place_relation"
			WHERE place_id = ${placeId}
			  AND kind = 'liked'
			  AND (${userId}::text IS NULL OR user_id <> ${userId ?? ''})
		),
		pair_stats AS (
			SELECT
				theirs.user_id,
				COUNT(*)::int AS shared_count,
				SUM(${AGREEMENT_EXPR})::float / NULLIF(COUNT(*), 0)::float AS score
			FROM "place_relation" theirs
			JOIN my_relations mine ON mine.place_id = theirs.place_id
			WHERE theirs.user_id IN (SELECT user_id FROM likers)
			  AND theirs.kind IN ('liked', 'disliked')
			GROUP BY theirs.user_id
		)
		SELECT
			u.id,
			u.name,
			u.image,
			COALESCE(ps.shared_count, 0) AS shared_count,
			CASE
				WHEN (SELECT COUNT(*) FROM my_relations) = 0 THEN NULL
				ELSE ps.score
			END AS score
		FROM likers lk
		JOIN "user" u ON u.id = lk.user_id
		LEFT JOIN pair_stats ps ON ps.user_id = lk.user_id
		ORDER BY score DESC NULLS LAST, lk.created_at DESC
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
 * Top N places in `city` of `category` that the user's top-K taste twins
 * liked, scored by sum of similarity weight, excluding places the user
 * already has a relation with (liked, disliked, or want-to-go - we don't
 * re-recommend places you've already taken a position on).
 *
 * A twin's negative score subtracts from recommendation weight, so a place
 * loved by someone who agrees with you AND hated by someone else with the
 * same taste profile lands lower than a place loved by both. Good.
 */
export async function getRecommendedPlaces(
	userId: string,
	city: string,
	category: 'restaurant' | 'bar' | 'shop',
	limit = 8
): Promise<RecommendedPlace[]> {
	const rows = await db.execute<{
		id: string;
		name: string;
		category: 'restaurant' | 'bar' | 'shop';
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
		pair_stats AS (
			SELECT
				theirs.user_id,
				SUM(${AGREEMENT_EXPR})::float / NULLIF(COUNT(*), 0)::float AS score
			FROM "place_relation" theirs
			JOIN my_relations mine ON mine.place_id = theirs.place_id
			WHERE theirs.user_id <> ${userId}
			  AND theirs.kind IN ('liked', 'disliked')
			GROUP BY theirs.user_id
		),
		algo_twins AS (
			SELECT user_id, score
			FROM pair_stats
			WHERE score > 0
			ORDER BY score DESC
			LIMIT ${TWIN_LIMIT}
		),
		twins AS (
			-- Algorithmic taste-twins + everyone the viewer follows.
			-- If someone is both, take the higher weight.
			SELECT user_id, MAX(score) AS score
			FROM (
				SELECT user_id, score FROM algo_twins
				UNION ALL
				SELECT followed_id AS user_id, ${FOLLOW_WEIGHT}::float AS score
				FROM "follow"
				WHERE follower_id = ${userId}
			) t
			GROUP BY user_id
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
		WHERE p.city = ${city}
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
		createdAt: r.created_at,
		score: Number(r.score) || 0,
		twinCount: r.twin_count
	}));
}

/**
 * Fallback when the user has no signal yet (cold start): top places in
 * the city by raw like count. Same shape so the UI doesn't branch.
 */
export async function getPopularPlaces(
	city: string,
	category: 'restaurant' | 'bar' | 'shop',
	limit = 8
): Promise<RecommendedPlace[]> {
	const rows = await db.execute<{
		id: string;
		name: string;
		category: 'restaurant' | 'bar' | 'shop';
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
		WHERE p.city = ${city} AND p.category = ${category}
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
		createdAt: r.created_at,
		score: 0,
		twinCount: r.like_count
	}));
}
