import { sql } from 'drizzle-orm';
import { db } from './db';
import { user, userActivity, userLocation } from './db/schema';

/**
 * Investor-facing growth metrics.
 *
 * Design: signups and subscribers are fully reconstructable from the
 * `created_at` / `canceled_at` timestamps on their source rows, so their
 * time series are computed on the fly here (giving complete history even
 * for dates before this feature shipped). Only active-user counts are
 * point-in-time gauges that can't be recovered after the fact, so those are
 * captured daily into `metric_snapshot` by the cron and read back below.
 *
 * "Active" = a user with a `user_activity.last_seen_at` heartbeat inside the
 * trailing window: DAU = 24h, WAU = 7d, MAU = 30d.
 */

export type HeadlineMetrics = {
	totalUsers: number;
	dau: number;
	wau: number;
	mau: number;
	subscribers: number;
	mrrCents: number;
};

export type SignupPoint = { day: string; newUsers: number; totalUsers: number };
export type SubscriberPoint = { day: string; subscribers: number; mrrCents: number };
export type ActivePoint = {
	day: string;
	activeDay: number;
	activeWeek: number;
	activeMonth: number;
};

/** Current headline numbers for the stat cards. */
export async function getHeadlineMetrics(): Promise<HeadlineMetrics> {
	const [row] = await db.execute<{
		total_users: number;
		dau: number;
		wau: number;
		mau: number;
		subscribers: number;
		mrr_cents: number;
	}>(sql`
		SELECT
			(SELECT COUNT(*)::int FROM "user") AS total_users,
			(SELECT COUNT(*)::int FROM user_activity WHERE last_seen_at >= now() - interval '1 day') AS dau,
			(SELECT COUNT(*)::int FROM user_activity WHERE last_seen_at >= now() - interval '7 days') AS wau,
			(SELECT COUNT(*)::int FROM user_activity WHERE last_seen_at >= now() - interval '30 days') AS mau,
			(SELECT COUNT(*)::int FROM subscription WHERE status = 'active') AS subscribers,
			(SELECT COALESCE(SUM(price_cents), 0)::int FROM subscription WHERE status = 'active') AS mrr_cents
	`);
	return {
		totalUsers: row.total_users,
		dau: row.dau,
		wau: row.wau,
		mau: row.mau,
		subscribers: row.subscribers,
		mrrCents: row.mrr_cents
	};
}

/** Daily new signups + running total over the trailing `days` window. */
export async function getSignupSeries(days: number): Promise<SignupPoint[]> {
	const rows = await db.execute<{ day: string; new_users: number; total_users: number }>(sql`
		WITH d AS (
			SELECT generate_series((CURRENT_DATE - ${days - 1}::int), CURRENT_DATE, interval '1 day')::date AS day
		)
		SELECT
			d.day,
			(SELECT COUNT(*)::int FROM "user" u WHERE u.created_at::date = d.day) AS new_users,
			(SELECT COUNT(*)::int FROM "user" u WHERE u.created_at::date <= d.day) AS total_users
		FROM d
		ORDER BY d.day
	`);
	return rows.map((r) => ({ day: r.day, newUsers: r.new_users, totalUsers: r.total_users }));
}

/** Active subscribers + MRR (cents) as of each day in the window. */
export async function getSubscriberSeries(days: number): Promise<SubscriberPoint[]> {
	const rows = await db.execute<{ day: string; subscribers: number; mrr_cents: number }>(sql`
		WITH d AS (
			SELECT generate_series((CURRENT_DATE - ${days - 1}::int), CURRENT_DATE, interval '1 day')::date AS day
		)
		SELECT
			d.day,
			(SELECT COUNT(*)::int FROM subscription s
				WHERE s.created_at::date <= d.day
				AND (s.canceled_at IS NULL OR s.canceled_at::date > d.day)) AS subscribers,
			(SELECT COALESCE(SUM(s.price_cents), 0)::int FROM subscription s
				WHERE s.created_at::date <= d.day
				AND (s.canceled_at IS NULL OR s.canceled_at::date > d.day)) AS mrr_cents
		FROM d
		ORDER BY d.day
	`);
	return rows.map((r) => ({ day: r.day, subscribers: r.subscribers, mrrCents: r.mrr_cents }));
}

/** DAU/WAU/MAU per day, read from the daily snapshots (0 for un-captured days). */
export async function getActiveUserSeries(days: number): Promise<ActivePoint[]> {
	const rows = await db.execute<{
		day: string;
		active_day: number;
		active_week: number;
		active_month: number;
	}>(sql`
		WITH d AS (
			SELECT generate_series((CURRENT_DATE - ${days - 1}::int), CURRENT_DATE, interval '1 day')::date AS day
		)
		SELECT
			d.day,
			COALESCE(ms.active_day, 0)::int AS active_day,
			COALESCE(ms.active_week, 0)::int AS active_week,
			COALESCE(ms.active_month, 0)::int AS active_month
		FROM d
		LEFT JOIN metric_snapshot ms ON ms.day = d.day
		ORDER BY d.day
	`);
	return rows.map((r) => ({
		day: r.day,
		activeDay: r.active_day,
		activeWeek: r.active_week,
		activeMonth: r.active_month
	}));
}

export type ConversionPoint = {
	day: string;
	twinImpressions: number;
	twinConversions: number;
	popularImpressions: number;
	popularConversions: number;
};

/**
 * Recommendation-to-like conversion per day, broken down by why the place
 * was recommended (twin match, or popularity fallback). Powers the admin
 * "how good are our recommendations" chart.
 *
 * A conversion is just "does a `liked` row exist for this (user, place)
 * pair" - `getRecommendedPlaces`/`getPopularPlaces` already exclude places
 * the user has any prior relation with, so a match necessarily postdates
 * the impression. Returns raw counts, not rates, since summing counts
 * across the range and dividing gives the right overall rate - averaging
 * per-day rates would misweight low-traffic days.
 */
export async function getRecommendationConversionSeries(days: number): Promise<ConversionPoint[]> {
	const rows = await db.execute<{
		day: string;
		twin_impressions: number;
		twin_conversions: number;
		popular_impressions: number;
		popular_conversions: number;
	}>(sql`
		WITH d AS (
			SELECT generate_series((CURRENT_DATE - ${days - 1}::int), CURRENT_DATE, interval '1 day')::date AS day
		)
		SELECT
			d.day,
			COUNT(*) FILTER (WHERE ri.reason = 'twin_match')::int AS twin_impressions,
			COUNT(*) FILTER (
				WHERE ri.reason = 'twin_match' AND EXISTS (
					SELECT 1 FROM "place_relation" pr
					WHERE pr.user_id = ri.user_id AND pr.place_id = ri.place_id AND pr.kind = 'liked'
				)
			)::int AS twin_conversions,
			COUNT(*) FILTER (WHERE ri.reason = 'popular_fallback')::int AS popular_impressions,
			COUNT(*) FILTER (
				WHERE ri.reason = 'popular_fallback' AND EXISTS (
					SELECT 1 FROM "place_relation" pr
					WHERE pr.user_id = ri.user_id AND pr.place_id = ri.place_id AND pr.kind = 'liked'
				)
			)::int AS popular_conversions
		FROM d
		LEFT JOIN recommendation_impression ri ON ri.shown_at::date = d.day
		GROUP BY d.day
		ORDER BY d.day
	`);
	return rows.map((r) => ({
		day: r.day,
		twinImpressions: r.twin_impressions,
		twinConversions: r.twin_conversions,
		popularImpressions: r.popular_impressions,
		popularConversions: r.popular_conversions
	}));
}

export type ConversionTotals = {
	impressions: number;
	conversions: number;
	twinImpressions: number;
	twinConversions: number;
	popularImpressions: number;
	popularConversions: number;
};

/**
 * Recommendation conversion summed over the trailing `days` window - raw
 * counts, not a per-day average (see `getRecommendationConversionSeries`).
 */
export async function getConversionTotals(days: number): Promise<ConversionTotals> {
	const conversion = await getRecommendationConversionSeries(days);
	return conversion.reduce(
		(acc, p) => ({
			impressions: acc.impressions + p.twinImpressions + p.popularImpressions,
			conversions: acc.conversions + p.twinConversions + p.popularConversions,
			twinImpressions: acc.twinImpressions + p.twinImpressions,
			twinConversions: acc.twinConversions + p.twinConversions,
			popularImpressions: acc.popularImpressions + p.popularImpressions,
			popularConversions: acc.popularConversions + p.popularConversions
		}),
		{
			impressions: 0,
			conversions: 0,
			twinImpressions: 0,
			twinConversions: 0,
			popularImpressions: 0,
			popularConversions: 0
		}
	);
}

/**
 * Record a user as active now. Called from the request hook, throttled there
 * so this is at most one write per user every few minutes.
 */
export async function touchUserActivity(userId: string): Promise<void> {
	await db
		.insert(userActivity)
		.values({ userId })
		.onConflictDoUpdate({ target: userActivity.userId, set: { lastSeenAt: sql`now()` } });
}

/**
 * Capture today's active-user counts into `metric_snapshot`. Idempotent -
 * re-running the same day overwrites the row, so running the cron more than
 * once (or manually) is safe. Returns the captured counts.
 */
export async function snapshotActiveUsers(): Promise<{
	activeDay: number;
	activeWeek: number;
	activeMonth: number;
}> {
	const [row] = await db.execute<{
		active_day: number;
		active_week: number;
		active_month: number;
	}>(sql`
		INSERT INTO metric_snapshot (day, active_day, active_week, active_month)
		SELECT
			CURRENT_DATE,
			COUNT(*) FILTER (WHERE last_seen_at >= now() - interval '1 day'),
			COUNT(*) FILTER (WHERE last_seen_at >= now() - interval '7 days'),
			COUNT(*) FILTER (WHERE last_seen_at >= now() - interval '30 days')
		FROM user_activity
		ON CONFLICT (day) DO UPDATE SET
			active_day = EXCLUDED.active_day,
			active_week = EXCLUDED.active_week,
			active_month = EXCLUDED.active_month
		RETURNING active_day, active_week, active_month
	`);
	return {
		activeDay: row.active_day,
		activeWeek: row.active_week,
		activeMonth: row.active_month
	};
}

export type UserLocationPoint = { latitude: number; longitude: number; count: number };
export type UserLocationStats = { total: number; locations: UserLocationPoint[] };

/**
 * Total user count plus a bubble-map dataset of `user_location` rows:
 * coordinates rounded to ~1km (3 decimal places) and grouped, so nearby users
 * in the same city collapse into one bubble instead of a cluster of
 * overlapping ones. `total` counts every user, not just those with a
 * location, matching the headline count shown elsewhere in the admin panel.
 */
export async function getUserLocationStats(): Promise<UserLocationStats> {
	const roundedLat = sql<number>`round(${userLocation.latitude}::numeric, 3)::double precision`;
	const roundedLng = sql<number>`round(${userLocation.longitude}::numeric, 3)::double precision`;

	const [[{ count: total }], locations] = await Promise.all([
		db.select({ count: sql<number>`count(*)::int` }).from(user),
		db
			.select({
				latitude: roundedLat,
				longitude: roundedLng,
				count: sql<number>`count(*)::int`
			})
			.from(userLocation)
			.groupBy(roundedLat, roundedLng)
	]);

	return { total, locations };
}
