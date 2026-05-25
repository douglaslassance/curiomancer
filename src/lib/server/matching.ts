/**
 * Taste-matching using Jaccard similarity over the like graph.
 *
 *     score(A, B) = |likes(A) ∩ likes(B)| / |likes(A) ∪ likes(B)|
 *
 * Range is 0..1, displayed as a 0..100 % match. The same notion drives
 * three derived feeds:
 *  - People in this city most similar to you.
 *  - Places in this city your top-K twins liked that you haven't.
 *  - (Future) Events in this city your top-K twins are interested in.
 *
 * Computed per-request via raw SQL. At our beta scale (hundreds of users,
 * thousands of likes) this is cheap. The migration path when it stops
 * being cheap is a nightly job that materializes a `recommendation` cache.
 */

import { sql } from 'drizzle-orm';
import { db } from './db';
import type { Place } from './db/schema';

export type MatchedPerson = {
	id: string;
	name: string;
	image: string | null;
	sharedCount: number;
	/** 0..1 — display as Math.round(score * 100). */
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
 * Top N people in `city` with the highest Jaccard similarity to `userId`.
 * Excludes the user themselves; includes only users with ≥1 shared like.
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
		WITH my_likes AS (
			SELECT place_id FROM "like" WHERE user_id = ${userId}
		),
		my_total AS (SELECT COUNT(*)::int AS n FROM my_likes),
		shared AS (
			SELECT l.user_id, COUNT(*)::int AS shared_count
			FROM "like" l
			JOIN my_likes ml ON l.place_id = ml.place_id
			WHERE l.user_id <> ${userId}
			GROUP BY l.user_id
		),
		totals AS (
			SELECT user_id, COUNT(*)::int AS n FROM "like" GROUP BY user_id
		)
		SELECT
			u.id,
			u.name,
			u.image,
			s.shared_count,
			s.shared_count::float / NULLIF((SELECT n FROM my_total) + t.n - s.shared_count, 0) AS score
		FROM shared s
		JOIN "user" u  ON u.id = s.user_id
		JOIN totals t  ON t.user_id = s.user_id
		JOIN user_location ul ON ul.user_id = s.user_id
		WHERE ul.city = ${city}
		ORDER BY score DESC NULLS LAST, s.shared_count DESC
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
 * has already liked.
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
		created_at: Date;
		score: number;
		twin_count: number;
	}>(sql`
		WITH my_likes AS (
			SELECT place_id FROM "like" WHERE user_id = ${userId}
		),
		my_total AS (SELECT COUNT(*)::int AS n FROM my_likes),
		shared AS (
			SELECT l.user_id, COUNT(*)::int AS shared_count
			FROM "like" l
			JOIN my_likes ml ON l.place_id = ml.place_id
			WHERE l.user_id <> ${userId}
			GROUP BY l.user_id
		),
		totals AS (
			SELECT user_id, COUNT(*)::int AS n FROM "like" GROUP BY user_id
		),
		twins AS (
			SELECT
				s.user_id,
				s.shared_count::float / NULLIF((SELECT n FROM my_total) + t.n - s.shared_count, 0) AS score
			FROM shared s
			JOIN totals t ON t.user_id = s.user_id
			ORDER BY score DESC NULLS LAST
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
			p.created_at,
			SUM(t.score)::float AS score,
			COUNT(DISTINCT t.user_id)::int AS twin_count
		FROM "like" l
		JOIN twins t ON t.user_id = l.user_id
		JOIN place p ON p.id = l.place_id
		WHERE p.city = ${city}
		  AND p.category = ${category}
		  AND p.id NOT IN (SELECT place_id FROM my_likes)
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
		createdAt: r.created_at,
		score: Number(r.score) || 0,
		twinCount: r.twin_count
	}));
}

/**
 * Fallback when the user has no likes yet (cold start): top places in the
 * city by raw popularity (like count). Same shape so the UI doesn't branch.
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
			p.created_at,
			COUNT(l.id)::int AS like_count
		FROM place p
		LEFT JOIN "like" l ON l.place_id = p.id
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
		createdAt: r.created_at,
		score: 0,
		twinCount: r.like_count
	}));
}
