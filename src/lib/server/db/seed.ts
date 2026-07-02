/**
 * Demo seed: populates the local database with fictional users ("personas")
 * who have liked real-world places sourced from Apple Maps. Used to
 * demonstrate and stress-test the taste-matching algorithm without
 * waiting for organic user signal.
 *
 * Never runs in production. The places themselves are real Apple Maps
 * POIs; the personas and their like patterns are entirely fabricated.
 *
 * Run with: pnpm db:seed:demo
 *
 * Apple Maps lookups are cached in seed-cache.json (committed to git) so
 * re-runs are deterministic and don't hit the network.
 */
import 'dotenv/config';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import {
	event,
	placeRelation,
	place,
	userLocation,
	type NewEvent,
	type NewPlace,
	type NewUserLocation
} from './schema.js';
import { user } from './auth.schema.js';
import { mapAppleCategory, searchAppleMaps, type AppleSearchResult } from '../maps-search.js';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

const sql = postgres(url, { max: 1 });
const db = drizzle(sql);

const CACHE_PATH = resolve(dirname(fileURLToPath(import.meta.url)), 'seed-cache.json');

// --- Places we want personas to know about --------------------------------
//
// Each entry is a search hint we'll pass to Apple Maps. The result gets
// cached so re-runs are offline.

type PlaceHint = {
	query: string;
	city: 'Los Angeles' | 'Tokyo';
	/** Override category if Apple's mapping disagrees with us. */
	category?: 'restaurant' | 'bar' | 'shop';
	neighborhood?: string;
	description?: string;
};

const PLACE_HINTS: PlaceHint[] = [
	// LA
	{
		query: 'Bestia Los Angeles',
		city: 'Los Angeles',
		neighborhood: 'Arts District',
		category: 'restaurant'
	},
	{
		query: 'Sqirl Los Angeles',
		city: 'Los Angeles',
		neighborhood: 'Virgil Village',
		category: 'restaurant'
	},
	{
		query: 'Gjusta Venice CA',
		city: 'Los Angeles',
		neighborhood: 'Venice',
		category: 'restaurant'
	},
	{
		query: 'Found Oyster Los Angeles',
		city: 'Los Angeles',
		neighborhood: 'East Hollywood',
		category: 'restaurant'
	},
	{
		query: 'Cobi Los Angeles',
		city: 'Los Angeles',
		neighborhood: 'Sawtelle',
		category: 'restaurant'
	},
	{
		query: 'The Varnish Los Angeles',
		city: 'Los Angeles',
		neighborhood: 'Downtown',
		category: 'bar'
	},
	{
		query: 'Bar Bandini Echo Park',
		city: 'Los Angeles',
		neighborhood: 'Echo Park',
		category: 'bar'
	},
	{
		query: 'Tabula Rasa Bar Los Angeles',
		city: 'Los Angeles',
		neighborhood: 'Thai Town',
		category: 'bar'
	},
	{
		query: 'Thunderbolt Los Angeles',
		city: 'Los Angeles',
		neighborhood: 'Historic Filipinotown',
		category: 'bar'
	},
	{
		query: 'Stories Books and Cafe Echo Park',
		city: 'Los Angeles',
		neighborhood: 'Echo Park',
		category: 'shop'
	},
	{
		query: 'Mohawk General Store Silver Lake',
		city: 'Los Angeles',
		neighborhood: 'Silver Lake',
		category: 'shop'
	},
	{
		query: 'Skylight Books Los Angeles',
		city: 'Los Angeles',
		neighborhood: 'Los Feliz',
		category: 'shop'
	},
	{
		query: 'Tartine bakery Downtown Los Angeles',
		city: 'Los Angeles',
		neighborhood: 'Downtown',
		category: 'shop'
	},

	// Tokyo
	{ query: 'Fuglen Tokyo Shibuya', city: 'Tokyo', neighborhood: 'Shibuya', category: 'shop' },
	{ query: 'Bar Trench Ebisu Tokyo', city: 'Tokyo', neighborhood: 'Ebisu', category: 'bar' },
	{
		query: 'Tsuta ramen Tokyo',
		city: 'Tokyo',
		neighborhood: 'Yoyogi-Uehara',
		category: 'restaurant'
	},
	{
		query: 'Sushi Saito Roppongi Tokyo',
		city: 'Tokyo',
		neighborhood: 'Roppongi',
		category: 'restaurant'
	},
	{
		query: 'Cow Books Nakameguro Tokyo',
		city: 'Tokyo',
		neighborhood: 'Nakameguro',
		category: 'shop'
	},
	{
		query: 'Beard restaurant Meguro Tokyo',
		city: 'Tokyo',
		neighborhood: 'Meguro',
		category: 'restaurant'
	},
	{
		query: 'Gen Yamamoto Azabu-Juban',
		city: 'Tokyo',
		neighborhood: 'Azabu-Juban',
		category: 'bar'
	},
	{
		query: 'Coutume Aoyama 5-50-7 Minato Tokyo',
		city: 'Tokyo',
		neighborhood: 'Aoyama',
		category: 'shop'
	},
	{
		query: 'Den restaurant Jingumae Shibuya Tokyo',
		city: 'Tokyo',
		neighborhood: 'Jingumae',
		category: 'restaurant'
	},
	{
		query: 'Bear Pond Espresso Shimokitazawa',
		city: 'Tokyo',
		neighborhood: 'Shimokitazawa',
		category: 'shop'
	},
	{ query: 'SG Club Shibuya Tokyo', city: 'Tokyo', neighborhood: 'Shibuya', category: 'bar' },
	{ query: 'Daikanyama T-Site', city: 'Tokyo', neighborhood: 'Daikanyama', category: 'shop' }
];

// --- Cache plumbing -------------------------------------------------------

type CachedPlace = {
	muid: string;
	name: string;
	city: string;
	category: 'restaurant' | 'bar' | 'shop';
	latitude: number;
	longitude: number;
	formattedAddress: string;
};

type Cache = Record<string, CachedPlace>;

async function readCache(): Promise<Cache> {
	try {
		const raw = await readFile(CACHE_PATH, 'utf8');
		return JSON.parse(raw) as Cache;
	} catch {
		return {};
	}
}

async function writeCache(cache: Cache) {
	await writeFile(CACHE_PATH, JSON.stringify(cache, null, '\t') + '\n');
}

function cacheKey(hint: PlaceHint): string {
	return `${hint.query}|${hint.city}`;
}

function resultToCached(
	r: AppleSearchResult,
	city: string,
	categoryOverride?: 'restaurant' | 'bar' | 'shop'
): CachedPlace | null {
	const category = categoryOverride ?? mapAppleCategory(r.poiCategory);
	if (!category) return null;
	return {
		muid: r.muid,
		name: r.name,
		city,
		category,
		latitude: r.latitude,
		longitude: r.longitude,
		formattedAddress: r.formattedAddress
	};
}

async function resolvePlace(hint: PlaceHint, cache: Cache): Promise<CachedPlace | null> {
	const key = cacheKey(hint);
	if (cache[key]) return cache[key];

	console.log(`  → searching Apple Maps for "${hint.query}"…`);
	const center =
		hint.city === 'Tokyo'
			? { latitude: 35.6762, longitude: 139.6503 }
			: { latitude: 34.0522, longitude: -118.2437 };
	const results = await searchAppleMaps(hint.query, { center });
	if (results.length === 0) {
		console.warn(`  ⚠ No Apple Maps result for "${hint.query}"`);
		return null;
	}
	const cached = resultToCached(results[0], hint.city, hint.category);
	if (!cached) {
		console.warn(`  ⚠ Could not classify "${hint.query}" (poiCategory=${results[0].poiCategory})`);
		return null;
	}
	cache[key] = cached;
	return cached;
}

// --- Events ----------------------------------------------------------------

const now = Date.now();
const day = 24 * 60 * 60 * 1000;
const at = (d: number, h: number) => new Date(now + d * day + h * 60 * 60 * 1000);

const EVENTS: NewEvent[] = [
	{
		name: 'Smorgasburg LA',
		category: 'food',
		city: 'Los Angeles',
		venue: 'ROW DTLA',
		description: '90+ vendors of LA street food on a sunny Sunday slab.',
		startsAt: at(3, 10),
		endsAt: at(3, 16)
	},
	{
		name: 'Hammer Museum: Late Night',
		category: 'art',
		city: 'Los Angeles',
		venue: 'Hammer Museum',
		description: 'After-hours gallery access with a bar in the courtyard.',
		startsAt: at(5, 19),
		endsAt: at(5, 23)
	},
	{
		name: 'Khruangbin at the Greek',
		category: 'music',
		city: 'Los Angeles',
		venue: 'Greek Theatre',
		description: 'Outdoor amphitheatre under the trees; one of the best rooms in LA.',
		startsAt: at(7, 20)
	},
	{
		name: 'New Beverly: 35mm Double Feature',
		category: 'film',
		city: 'Los Angeles',
		venue: 'New Beverly Cinema',
		description: 'Two Tarantino-curated 35mm prints back to back.',
		startsAt: at(2, 19)
	},
	{
		name: 'Silver Lake Flea',
		category: 'community',
		city: 'Los Angeles',
		venue: 'Sunset Triangle',
		description: 'Vintage furniture, art, and clothes from local dealers.',
		startsAt: at(6, 10),
		endsAt: at(6, 15)
	},
	{
		name: 'Dodgers vs Giants',
		category: 'sports',
		city: 'Los Angeles',
		venue: 'Dodger Stadium',
		description: 'Hill seats, $6 Dodger dogs, the only sports rivalry that matters in California.',
		startsAt: at(9, 19)
	},
	{
		name: 'teamLab Planets - final week',
		category: 'art',
		city: 'Tokyo',
		venue: 'teamLab Planets Toyosu',
		description: 'Immersive water-and-light installation; bring rolled-up pants.',
		startsAt: at(1, 10),
		endsAt: at(1, 22)
	},
	{
		name: 'Wandering Records Pop-up',
		category: 'music',
		city: 'Tokyo',
		venue: 'Shimokitazawa',
		description: 'Listening bar takeover with three guest selectors all night.',
		startsAt: at(4, 19),
		endsAt: at(4, 26)
	},
	{
		name: 'Aoyama Farmers Market',
		category: 'food',
		city: 'Tokyo',
		venue: 'United Nations University Plaza',
		description: 'Saturday farmer + craft market in Aoyama - produce, sake, baked goods.',
		startsAt: at(2, 10),
		endsAt: at(2, 16)
	},
	{
		name: 'Cinema Vera: Wong Kar-wai retrospective',
		category: 'film',
		city: 'Tokyo',
		venue: 'Cinema Vera Shibuya',
		description: 'Six WKW films across the weekend, all 35mm.',
		startsAt: at(5, 14),
		endsAt: at(5, 23)
	},
	{
		name: 'Daikanyama Book Festival',
		category: 'community',
		city: 'Tokyo',
		venue: 'Daikanyama T-Site',
		description: 'Indie publishers, zines, and used-book hunters until late.',
		startsAt: at(6, 11),
		endsAt: at(6, 19)
	},
	{
		name: 'Giants vs Swallows',
		category: 'sports',
		city: 'Tokyo',
		venue: 'Tokyo Dome',
		description: 'Yomiuri Giants at home - the most fun-loud crowd in NPB.',
		startsAt: at(8, 18)
	}
];

// --- Personas -------------------------------------------------------------
//
// Each persona's `likes` is a list of `PlaceHint.query` strings - the
// matching query, not the place name. This keeps everything indirectable
// through the cache.

type Persona = {
	name: string;
	email: string;
	city: 'Los Angeles' | 'Tokyo';
	latitude: number;
	longitude: number;
	timezone: string;
	likes: string[];
};

const LA = {
	city: 'Los Angeles' as const,
	lat: 34.0522,
	lng: -118.2437,
	tz: 'America/Los_Angeles'
};
const TY = { city: 'Tokyo' as const, lat: 35.6762, lng: 139.6503, tz: 'Asia/Tokyo' };

const PERSONAS: Persona[] = [
	{
		name: 'Maya Tanaka',
		email: 'maya@demo.curiomancer',
		city: TY.city,
		latitude: TY.lat,
		longitude: TY.lng,
		timezone: TY.tz,
		likes: [
			'Fuglen Tokyo Shibuya',
			'Bar Trench Ebisu Tokyo',
			'Cow Books Nakameguro Tokyo',
			'Coutume Aoyama 5-50-7 Minato Tokyo'
		]
	},
	{
		name: 'Sam Okafor',
		email: 'sam@demo.curiomancer',
		city: TY.city,
		latitude: TY.lat,
		longitude: TY.lng,
		timezone: TY.tz,
		likes: [
			'Tsuta ramen Tokyo',
			'Sushi Saito Roppongi Tokyo',
			'Beard restaurant Meguro Tokyo',
			'Den restaurant Jingumae Shibuya Tokyo',
			'Bar Trench Ebisu Tokyo',
			'SG Club Shibuya Tokyo'
		]
	},
	{
		name: 'Léo Bernard',
		email: 'leo@demo.curiomancer',
		city: TY.city,
		latitude: TY.lat,
		longitude: TY.lng,
		timezone: TY.tz,
		likes: [
			'Fuglen Tokyo Shibuya',
			'Coutume Aoyama 5-50-7 Minato Tokyo',
			'Daikanyama T-Site',
			'Bestia Los Angeles'
		]
	},
	{
		name: 'Yuki Nakamura',
		email: 'yuki@demo.curiomancer',
		city: TY.city,
		latitude: TY.lat,
		longitude: TY.lng,
		timezone: TY.tz,
		likes: [
			'Den restaurant Jingumae Shibuya Tokyo',
			'Gen Yamamoto Azabu-Juban',
			'Beard restaurant Meguro Tokyo',
			'Bestia Los Angeles',
			'Sqirl Los Angeles'
		]
	},
	{
		name: 'Hana Wright',
		email: 'hana@demo.curiomancer',
		city: TY.city,
		latitude: TY.lat,
		longitude: TY.lng,
		timezone: TY.tz,
		likes: [
			'Bear Pond Espresso Shimokitazawa',
			'Bar Trench Ebisu Tokyo',
			'Cow Books Nakameguro Tokyo'
		]
	},
	{
		name: 'Aiden Park',
		email: 'aiden@demo.curiomancer',
		city: LA.city,
		latitude: LA.lat,
		longitude: LA.lng,
		timezone: LA.tz,
		likes: [
			'Bestia Los Angeles',
			'Gjusta Venice CA',
			'Bar Bandini Echo Park',
			'Mohawk General Store Silver Lake',
			'Cow Books Nakameguro Tokyo'
		]
	},
	{
		name: 'Camille Rivera',
		email: 'camille@demo.curiomancer',
		city: LA.city,
		latitude: LA.lat,
		longitude: LA.lng,
		timezone: LA.tz,
		likes: [
			'Sqirl Los Angeles',
			'Tartine bakery Downtown Los Angeles',
			'Stories Books and Cafe Echo Park',
			'Skylight Books Los Angeles',
			'Daikanyama T-Site',
			'Bear Pond Espresso Shimokitazawa'
		]
	},
	{
		name: 'Marcus Hill',
		email: 'marcus@demo.curiomancer',
		city: LA.city,
		latitude: LA.lat,
		longitude: LA.lng,
		timezone: LA.tz,
		likes: [
			'Thunderbolt Los Angeles',
			'Bar Bandini Echo Park',
			'The Varnish Los Angeles',
			'Tabula Rasa Bar Los Angeles',
			'SG Club Shibuya Tokyo',
			'Bar Trench Ebisu Tokyo'
		]
	},
	{
		name: 'Priya Shah',
		email: 'priya@demo.curiomancer',
		city: LA.city,
		latitude: LA.lat,
		longitude: LA.lng,
		timezone: LA.tz,
		likes: ['Found Oyster Los Angeles', 'Cobi Los Angeles', 'Coutume Aoyama 5-50-7 Minato Tokyo']
	},
	{
		name: 'Theo Lambert',
		email: 'theo@demo.curiomancer',
		city: LA.city,
		latitude: LA.lat,
		longitude: LA.lng,
		timezone: LA.tz,
		likes: ['Mohawk General Store Silver Lake', 'Bear Pond Espresso Shimokitazawa']
	}
];

// --- Run -------------------------------------------------------------------

console.log('Resolving places via Apple Maps (with cache)…');
const cache = await readCache();
const hintByQuery = new Map(PLACE_HINTS.map((h) => [h.query, h]));
const resolved = new Map<string, CachedPlace>();
for (const hint of PLACE_HINTS) {
	const r = await resolvePlace(hint, cache);
	if (r) resolved.set(hint.query, r);
}
await writeCache(cache);

console.log('Clearing dependent rows…');
await db.delete(placeRelation);
await db.delete(userLocation);
await db.delete(event);
await db.delete(place);
await sql`DELETE FROM "user" WHERE email LIKE '%@demo.curiomancer'`;

console.log(`Inserting ${resolved.size} places (source=apple)…`);
const placeRows: NewPlace[] = [...resolved.entries()].map(([query, r]) => {
	const hint = hintByQuery.get(query)!;
	return {
		name: r.name,
		category: r.category,
		city: r.city,
		neighborhood: hint.neighborhood ?? null,
		description: hint.description ?? `${r.name} - ${r.formattedAddress}`,
		latitude: r.latitude,
		longitude: r.longitude,
		source: 'apple' as const,
		externalId: r.muid
	};
});
const insertedPlaces = await db.insert(place).values(placeRows).returning();
const placeIdByQuery = new Map<string, string>();
for (const [query, r] of resolved) {
	const created = insertedPlaces.find((p) => p.externalId === r.muid);
	if (created) placeIdByQuery.set(query, created.id);
}

console.log(`Inserting ${EVENTS.length} events…`);
await db.insert(event).values(EVENTS);

console.log(`Inserting ${PERSONAS.length} demo personas…`);
const personaRows = PERSONAS.map((p) => ({
	id: crypto.randomUUID() as string,
	name: p.name,
	email: p.email,
	emailVerified: false
}));
await db.insert(user).values(personaRows);
const userIdByEmail = new Map(personaRows.map((u) => [u.email, u.id]));

const locationRows: NewUserLocation[] = PERSONAS.map((p) => ({
	userId: userIdByEmail.get(p.email)!,
	city: p.city,
	latitude: p.latitude,
	longitude: p.longitude,
	timezone: p.timezone,
	countryCode: p.city === 'Tokyo' ? 'JP' : 'US'
}));
await db.insert(userLocation).values(locationRows);

const likeRows = PERSONAS.flatMap((p) =>
	p.likes
		.map((query) => {
			const placeId = placeIdByQuery.get(query);
			if (!placeId) {
				console.warn(`  ⚠ Persona ${p.name} likes "${query}" but it didn't resolve; skipping.`);
				return null;
			}
			return { userId: userIdByEmail.get(p.email)!, placeId };
		})
		.filter((row): row is { userId: string; placeId: string } => row !== null)
);
if (likeRows.length > 0) await db.insert(placeRelation).values(likeRows);

console.log(
	`Done - ${resolved.size} places, ${EVENTS.length} events, ${PERSONAS.length} personas, ${likeRows.length} likes.`
);
await sql.end();
