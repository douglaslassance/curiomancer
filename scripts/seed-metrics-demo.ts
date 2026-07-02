/**
 * Demo-only metrics data so the admin Growth dashboard shows realistic curves
 * without waiting for organic traffic. Generates a fleet of fake users spread
 * across a 90-day accelerating growth curve, then derives:
 *   - Pro subscriptions (with a little churn) -> subscriber + MRR curves.
 *   - 90 days of active-user snapshots at believable DAU < WAU < MAU ratios.
 *   - Live last-seen heartbeats so the headline DAU/WAU/MAU cards are non-trivial.
 *
 * Fake users are tagged with an @demo.curiomancer email so re-runs purge and
 * regenerate cleanly, and real accounts (including admins) are never touched.
 * They have no auth rows, so they can't sign in - they exist only to populate
 * counts. Never runs in production.
 *
 * Run with: pnpm seed:metrics:demo
 */
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';

if (process.env.NODE_ENV === 'production') {
	throw new Error('Refusing to seed demo metrics in production.');
}

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');
const sql = postgres(url);

const DEMO_DOMAIN = 'demo.curiomancer';
const WINDOW = 90; // days of history
const TARGET_USERS = 220; // fake users by end of window
const PRO_PRICE = 499; // $4.99
const SUB_EVERY = 6; // ~1 in 6 users subscribes
const CHURN_EVERY = 8; // ~1 in 8 subscribers later cancels

const dayMs = 86_400_000;
const now = Date.now();
const daysAgo = (d: number) => new Date(now - d * dayMs);

// Accelerating (convex) cumulative curve: slow start, steeper recently.
const cumulative = (t: number) => Math.round(TARGET_USERS * Math.pow(t / WINDOW, 1.8));

// --- Purge prior demo artifacts (idempotent) -----------------------------
// Deleting demo users cascades to their subscriptions and activity rows.
await sql`DELETE FROM "user" WHERE email LIKE ${'%@' + DEMO_DOMAIN}`;
await sql`DELETE FROM subscription`;
await sql`DELETE FROM metric_snapshot`;

// --- Fake users along the growth curve -----------------------------------
type Row = { id: string; name: string; email: string; created_at: Date; updated_at: Date };
const users: Row[] = [];
for (let t = 1; t <= WINDOW; t++) {
	const count = cumulative(t) - cumulative(t - 1);
	for (let i = 0; i < count; i++) {
		const n = users.length + 1;
		const created = daysAgo(WINDOW - t);
		users.push({
			id: randomUUID(),
			name: `Demo User ${n}`,
			email: `demo-user-${n}@${DEMO_DOMAIN}`,
			created_at: created,
			updated_at: created
		});
	}
}
// Bulk insert in chunks to keep the statement size sane.
for (let i = 0; i < users.length; i += 100) {
	const chunk = users.slice(i, i + 100);
	await sql`INSERT INTO "user" ${sql(chunk, 'id', 'name', 'email', 'created_at', 'updated_at')}`;
}

// --- Subscriptions (with churn) ------------------------------------------
const subs: {
	id: string;
	user_id: string;
	tier: string;
	status: string;
	price_cents: number;
	created_at: Date;
	canceled_at: Date | null;
}[] = [];
let subIdx = 0;
for (let u = 0; u < users.length; u++) {
	if (u % SUB_EVERY !== 0) continue;
	subIdx++;
	// Subscribe a few days after signup.
	const start = new Date(users[u].created_at.getTime() + 3 * dayMs);
	if (start.getTime() > now) continue; // not yet subscribed
	const churned = subIdx % CHURN_EVERY === 0;
	const canceled = churned ? new Date(start.getTime() + 21 * dayMs) : null;
	subs.push({
		id: randomUUID(),
		user_id: users[u].id,
		tier: 'pro',
		status: churned && canceled && canceled.getTime() <= now ? 'canceled' : 'active',
		price_cents: PRO_PRICE,
		created_at: start,
		canceled_at: canceled && canceled.getTime() <= now ? canceled : null
	});
}
for (let i = 0; i < subs.length; i += 100) {
	const chunk = subs.slice(i, i + 100);
	await sql`INSERT INTO subscription ${sql(chunk, 'id', 'user_id', 'tier', 'status', 'price_cents', 'created_at', 'canceled_at')}`;
}

// --- Active-user snapshots -------------------------------------------------
// Believable engagement ratios off the cumulative user base each day.
const snaps: { day: string; active_day: number; active_week: number; active_month: number }[] = [];
for (let d = WINDOW - 1; d >= 0; d--) {
	const usersSoFar = cumulative(WINDOW - d);
	const mau = Math.round(usersSoFar * 0.45);
	const wau = Math.round(mau * 0.6);
	const dau = Math.round(wau * 0.4);
	snaps.push({
		day: daysAgo(d).toISOString().slice(0, 10),
		active_day: dau,
		active_week: wau,
		active_month: mau
	});
}
for (const s of snaps) {
	await sql`
		INSERT INTO metric_snapshot (day, active_day, active_week, active_month)
		VALUES (${s.day}, ${s.active_day}, ${s.active_week}, ${s.active_month})
		ON CONFLICT (day) DO UPDATE SET
			active_day = EXCLUDED.active_day,
			active_week = EXCLUDED.active_week,
			active_month = EXCLUDED.active_month
	`;
}

// --- Live heartbeats -------------------------------------------------------
// Match the latest snapshot so the headline cards line up with the chart.
const latest = snaps[snaps.length - 1];
const shuffled = [...users].sort(() => Math.random() - 0.5);
const beats: { user_id: string; last_seen_at: Date }[] = [];
let cursor = 0;
const take = (n: number, maxDaysAgo: number, minDaysAgo: number) => {
	for (let i = 0; i < n && cursor < shuffled.length; i++, cursor++) {
		const span = maxDaysAgo - minDaysAgo;
		const when = new Date(now - (minDaysAgo + Math.random() * span) * dayMs);
		beats.push({ user_id: shuffled[cursor].id, last_seen_at: when });
	}
};
take(latest.active_day, 1, 0); // within 24h  -> DAU
take(latest.active_week - latest.active_day, 7, 1); // 1-7 days -> WAU
take(latest.active_month - latest.active_week, 30, 7); // 7-30 days -> MAU
for (let i = 0; i < beats.length; i += 100) {
	const chunk = beats.slice(i, i + 100);
	await sql`
		INSERT INTO user_activity ${sql(chunk, 'user_id', 'last_seen_at')}
		ON CONFLICT (user_id) DO UPDATE SET last_seen_at = EXCLUDED.last_seen_at
	`;
}

console.log(
	`Seeded ${users.length} demo users, ${subs.length} subscriptions, ${snaps.length} snapshots, ${beats.length} heartbeats.`
);
await sql.end();
