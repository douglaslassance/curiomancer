/**
 * Backfill geocoded coordinates for waitlist rows that have a city but no
 * latitude/longitude, so they show up on the admin waitlist map.
 *
 * People join the waitlist with best-effort geocoding (joinWaitlist in
 * src/lib/server/waitlist.ts): if Apple's geocode hiccups at signup, the row
 * lands with null coords. getWaitlistStats then filters the map dataset to
 * non-null coords, so those rows are counted in the total but never plotted -
 * which is why the map can under-represent the headline number. This
 * re-geocodes the stragglers. Idempotent: it only touches rows still missing
 * coords, so it is safe to re-run. Writes coordinates only, never deletes.
 *
 * Run against the database that actually holds the entries (i.e. production):
 *   DATABASE_URL=... pnpm backfill:waitlist-coords
 * or: DATABASE_URL=... tsx scripts/backfill-waitlist-coords.ts
 *
 * Self-contained connection (like the other backfills) because src/lib/server/db
 * reads DATABASE_URL through SvelteKit's $env alias, which only exists inside
 * the app runtime. The Apple geocoder (mapkit.ts) reads its key from
 * process.env first, so `dotenv/config` plus the MAPKIT_* vars is enough here.
 */
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { and, eq, isNull, isNotNull, or } from 'drizzle-orm';
import { doublePrecision, pgTable, text } from 'drizzle-orm/pg-core';
import { geocodeApple } from '../src/lib/server/maps-search';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

// Minimal shape - just the columns this backfill reads and writes.
const waitlist = pgTable('waitlist', {
	id: text('id').primaryKey(),
	email: text('email').notNull(),
	city: text('city'),
	latitude: doublePrecision('latitude'),
	longitude: doublePrecision('longitude')
});

const client = postgres(url);
const db = drizzle(client);

const rows = await db
	.select({ id: waitlist.id, email: waitlist.email, city: waitlist.city })
	.from(waitlist)
	.where(and(isNotNull(waitlist.city), or(isNull(waitlist.latitude), isNull(waitlist.longitude))));

console.log(`[backfill] ${rows.length} waitlist row(s) with a city but no coordinates`);

let filled = 0;
let skipped = 0;
for (const row of rows) {
	const city = row.city?.trim();
	if (!city) {
		skipped++;
		continue;
	}
	try {
		const coords = await geocodeApple(city);
		if (!coords) {
			console.warn(`[backfill] no geocode for "${city}" (${row.email}) - left null`);
			skipped++;
			continue;
		}
		await db
			.update(waitlist)
			.set({ latitude: coords.latitude, longitude: coords.longitude })
			.where(eq(waitlist.id, row.id));
		filled++;
		console.log(`[backfill] ${row.email}: "${city}" -> ${coords.latitude}, ${coords.longitude}`);
	} catch (err) {
		console.error(`[backfill] geocode failed for "${city}" (${row.email}):`, err);
		skipped++;
	}
}

console.log(`[backfill] done: ${filled} filled, ${skipped} still missing`);
await client.end();
