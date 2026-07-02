import { sql } from 'drizzle-orm';
import { db } from './db';
import { userActivity } from './db/schema';

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
