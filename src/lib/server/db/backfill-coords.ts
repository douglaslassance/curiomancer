/**
 * One-off backfill: stamp latitude/longitude onto our seeded places.
 *
 * Idempotent — only updates rows where coords are NULL. Safe to re-run.
 * Run with: pnpm db:backfill-coords
 */
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, isNull, and } from 'drizzle-orm';
import postgres from 'postgres';
import { place } from './schema.js';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

const sql = postgres(url, { max: 1 });
const db = drizzle(sql);

// Hand-picked coords (≈ within a block of each spot). Better than the
// Nominatim round-trip, deterministic, and good enough for v1 map pins.
const COORDS: Array<{ name: string; city: string; latitude: number; longitude: number }> = [
	// ─── Los Angeles ──────────────────────────────────────────────────────────
	{ name: 'Bestia', city: 'Los Angeles', latitude: 34.0392, longitude: -118.2354 },
	{ name: 'Apparatus Coffee', city: 'Los Angeles', latitude: 34.0911, longitude: -118.2754 },
	{ name: 'The Varnish', city: 'Los Angeles', latitude: 34.0469, longitude: -118.2493 },
	{ name: 'Sqirl', city: 'Los Angeles', latitude: 34.0902, longitude: -118.2841 },
	{ name: 'Heritage Fine Wines', city: 'Los Angeles', latitude: 34.0691, longitude: -118.4011 },
	{ name: 'Gjusta', city: 'Los Angeles', latitude: 33.9999, longitude: -118.4636 },
	{ name: 'Stories Books & Cafe', city: 'Los Angeles', latitude: 34.078, longitude: -118.2596 },
	{ name: 'Found Oyster', city: 'Los Angeles', latitude: 34.0907, longitude: -118.2945 },
	{ name: 'Bar Bandini', city: 'Los Angeles', latitude: 34.0789, longitude: -118.2602 },
	{ name: 'Mohawk General Store', city: 'Los Angeles', latitude: 34.0911, longitude: -118.2754 },
	{ name: 'Tartine', city: 'Los Angeles', latitude: 34.0405, longitude: -118.2398 },
	{ name: 'Tabula Rasa Bar', city: 'Los Angeles', latitude: 34.1011, longitude: -118.3075 },
	{ name: 'Cobi', city: 'Los Angeles', latitude: 34.0421, longitude: -118.4515 },
	{ name: 'Skylight Books', city: 'Los Angeles', latitude: 34.1009, longitude: -118.2899 },
	{ name: 'Thunderbolt', city: 'Los Angeles', latitude: 34.0623, longitude: -118.2701 },

	// ─── Tokyo ────────────────────────────────────────────────────────────────
	{ name: 'Fuglen Tokyo', city: 'Tokyo', latitude: 35.6731, longitude: 139.6926 },
	{ name: 'Bar Trench', city: 'Tokyo', latitude: 35.6478, longitude: 139.7104 },
	{ name: 'Tsuta', city: 'Tokyo', latitude: 35.6688, longitude: 139.6817 },
	{ name: 'Sushi Saito', city: 'Tokyo', latitude: 35.6618, longitude: 139.7376 },
	{ name: 'Cow Books', city: 'Tokyo', latitude: 35.6435, longitude: 139.6989 },
	{ name: 'Beard', city: 'Tokyo', latitude: 35.6336, longitude: 139.7019 },
	{ name: 'Gen Yamamoto', city: 'Tokyo', latitude: 35.6582, longitude: 139.7345 },
	{ name: 'Tomboy', city: 'Tokyo', latitude: 35.6437, longitude: 139.6707 },
	{ name: 'Coutume Aoyama', city: 'Tokyo', latitude: 35.6643, longitude: 139.7115 },
	{ name: 'Den', city: 'Tokyo', latitude: 35.6691, longitude: 139.7044 },
	{ name: 'Bear Pond Espresso', city: 'Tokyo', latitude: 35.6614, longitude: 139.6679 },
	{ name: 'SG Club', city: 'Tokyo', latitude: 35.6604, longitude: 139.6975 },
	{ name: 'Daikanyama T-Site', city: 'Tokyo', latitude: 35.6498, longitude: 139.7022 },
	{ name: 'Narisawa', city: 'Tokyo', latitude: 35.6646, longitude: 139.7211 },
	{ name: 'Track', city: 'Tokyo', latitude: 35.6669, longitude: 139.7159 }
];

let updated = 0;
let skipped = 0;
for (const c of COORDS) {
	const result = await db
		.update(place)
		.set({ latitude: c.latitude, longitude: c.longitude })
		.where(and(eq(place.name, c.name), eq(place.city, c.city), isNull(place.latitude)))
		.returning({ id: place.id });
	if (result.length > 0) updated++;
	else skipped++;
}

console.log(`Backfilled ${updated} places (${skipped} already had coords).`);
await sql.end();
