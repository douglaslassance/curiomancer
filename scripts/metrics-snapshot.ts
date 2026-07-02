/**
 * Standalone daily-metrics snapshot. The same capture the in-process cron
 * runs (src/lib/server/cron.ts), but invokable without booting the server -
 * handy for testing, manual backfills, or wiring to an external scheduler.
 *
 * Run with: pnpm metrics:snapshot
 *
 * Self-contained connection (like seed.ts) because src/lib/server/db reads
 * DATABASE_URL through SvelteKit's $env alias, which only exists inside the
 * app runtime.
 */
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

const client = postgres(url);
const db = drizzle(client);

const [row] = await db.execute(sql`
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
	RETURNING day, active_day, active_week, active_month
`);

console.log('[metrics] snapshot captured:', row);
await client.end();
