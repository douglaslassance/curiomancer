/**
 * Radius-based queries for places and people, using haversine distance
 * computed in raw SQL. Replaces the older "WHERE city = $1" pattern that
 * broke on metro subdivisions (Tokyo wards, NYC boroughs, etc.).
 *
 * The earth-radius constant (6371 km) is hardcoded - yes, the earth is
 * a slightly squashed sphere; the few-meter error doesn't matter for
 * "places within 30 km" recommendations.
 */

import { sql } from 'drizzle-orm';
import { db } from './db';
import type { Place } from './db/schema';

/**
 * SQL fragment computing great-circle distance in km between a fixed
 * (lat, lng) point and the columns named `lat_col` and `lng_col` on the
 * outer query. Both inputs in degrees; output in km.
 *
 *   const dist = haversineKm(34.05, -118.24, 'p.latitude', 'p.longitude');
 *   await db.execute(sql`SELECT * FROM place p WHERE ${dist} < 30`);
 *
 * The coordinates are bound as query parameters, not interpolated, so this can
 * never become a SQL-injection vector even if a caller ever passes a
 * request-derived number. Only the column names are raw, and those are
 * hardcoded literals supplied by the callers here.
 */
export const haversineKm = (lat: number, lng: number, latCol: string, lngCol: string) => {
	const latColSql = sql.raw(latCol);
	const lngColSql = sql.raw(lngCol);
	return sql`
		6371.0 * acos(
			LEAST(1.0,
				cos(radians(${lat})) * cos(radians(${latColSql})) *
				cos(radians(${lngColSql}) - radians(${lng})) +
				sin(radians(${lat})) * sin(radians(${latColSql}))
			)
		)
	`;
};

/**
 * Antipodal distance (pi * 6371) rounded up - the farthest any two points on
 * Earth can be from each other. A radius clamp at this value can never
 * exclude anywhere on the planet, whatever the search center.
 */
export const MAX_RADIUS_KM = 20016;

export type NearbyPlace = Place & {
	distanceKm: number;
};

/** All places within `radiusKm` of the point, sorted by distance. */
export async function getPlacesNearby(
	lat: number,
	lng: number,
	radiusKm: number
): Promise<NearbyPlace[]> {
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
		distance_km: number;
	}>(sql`
		SELECT
			p.*,
			${haversineKm(lat, lng, 'p.latitude', 'p.longitude')} AS distance_km
		FROM place p
		WHERE p.latitude IS NOT NULL
		  AND p.longitude IS NOT NULL
		  AND ${haversineKm(lat, lng, 'p.latitude', 'p.longitude')} <= ${radiusKm}
		ORDER BY distance_km ASC
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
		distanceKm: Number(r.distance_km) || 0
	}));
}

export type NearbyPerson = {
	id: string;
	name: string;
	image: string | null;
	city: string;
	distanceKm: number;
	/** -1..+1; null if viewer has no signal to compare against. */
	score: number | null;
	sharedCount: number;
};

/**
 * Users with a known location within `radiusKm` of the point, with their
 * signed-similarity score relative to `viewerUserId`. Excludes the viewer.
 */
export async function getPeopleNearby(
	lat: number,
	lng: number,
	radiusKm: number,
	viewerUserId: string | null
): Promise<NearbyPerson[]> {
	const rows = await db.execute<{
		id: string;
		name: string;
		image: string | null;
		city: string;
		distance_km: number;
		shared_count: number | null;
		score: number | null;
	}>(sql`
		WITH viewer_relations AS (
			SELECT place_id, kind FROM "place_relation"
			WHERE user_id = ${viewerUserId ?? ''} AND kind IN ('liked', 'disliked')
		),
		nearby_users AS (
			SELECT
				ul.user_id,
				ul.city,
				${haversineKm(lat, lng, 'ul.latitude', 'ul.longitude')} AS distance_km
			FROM user_location ul
			WHERE ${haversineKm(lat, lng, 'ul.latitude', 'ul.longitude')} <= ${radiusKm}
			  AND (${viewerUserId}::text IS NULL OR ul.user_id <> ${viewerUserId ?? ''})
			  AND (${viewerUserId}::text IS NULL OR ul.user_id NOT IN (
			  	SELECT blocked_id FROM "block" WHERE blocker_id = ${viewerUserId ?? ''}
			  	UNION
			  	SELECT blocker_id FROM "block" WHERE blocked_id = ${viewerUserId ?? ''}
			  ))
		),
		pair_stats AS (
			SELECT
				theirs.user_id,
				COUNT(*)::int AS shared_count,
				SUM(CASE WHEN mine.kind = theirs.kind THEN 1 ELSE -1 END)::float
					/ NULLIF(COUNT(*), 0)::float AS score
			FROM "place_relation" theirs
			JOIN viewer_relations mine ON mine.place_id = theirs.place_id
			WHERE theirs.user_id IN (SELECT user_id FROM nearby_users)
			  AND theirs.kind IN ('liked', 'disliked')
			GROUP BY theirs.user_id
		)
		SELECT
			u.id,
			u.name,
			u.image,
			nu.city,
			nu.distance_km,
			ps.shared_count,
			CASE
				WHEN (SELECT COUNT(*) FROM viewer_relations) = 0 THEN NULL
				ELSE ps.score
			END AS score
		FROM nearby_users nu
		JOIN "user" u ON u.id = nu.user_id
		LEFT JOIN pair_stats ps ON ps.user_id = nu.user_id
		ORDER BY score DESC NULLS LAST, distance_km ASC
	`);

	return rows.map((r) => ({
		id: r.id,
		name: r.name,
		image: r.image,
		city: r.city,
		distanceKm: Number(r.distance_km) || 0,
		score: r.score === null ? null : Number(r.score),
		sharedCount: r.shared_count ?? 0
	}));
}
