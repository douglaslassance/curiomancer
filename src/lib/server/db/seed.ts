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
import { randomBytes } from 'node:crypto';
import { inArray, or, like, sql as dsql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import {
	event,
	invite,
	placeRelation,
	place,
	userLocation,
	waitlist,
	type NewEvent,
	type NewPlace,
	type NewUserLocation
} from './schema.js';
import { user } from './auth.schema.js';
import { mapAppleCategory, searchAppleMaps, type AppleSearchResult } from '../maps-search.js';

/** Matches both the current demo domain and the pre-rename "Bond" one. */
const DEMO_EMAIL_PATTERNS = ['%@demo.curiomancer', '%@demo.bond'];

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
	category?: 'eat' | 'drink' | 'shop' | 'visit';
	neighborhood?: string;
	description?: string;
};

const PLACE_HINTS: PlaceHint[] = [
	// LA
	{
		query: 'Bestia Los Angeles',
		city: 'Los Angeles',
		neighborhood: 'Arts District',
		category: 'eat'
	},
	{
		query: 'Sqirl Los Angeles',
		city: 'Los Angeles',
		neighborhood: 'Virgil Village',
		category: 'eat'
	},
	{
		query: 'Gjusta Venice CA',
		city: 'Los Angeles',
		neighborhood: 'Venice',
		category: 'eat'
	},
	{
		query: 'Found Oyster Los Angeles',
		city: 'Los Angeles',
		neighborhood: 'East Hollywood',
		category: 'eat'
	},
	{
		query: 'Cobi Los Angeles',
		city: 'Los Angeles',
		neighborhood: 'Sawtelle',
		category: 'eat'
	},
	{
		query: 'The Varnish Los Angeles',
		city: 'Los Angeles',
		neighborhood: 'Downtown',
		category: 'drink'
	},
	{
		query: 'Bar Bandini Echo Park',
		city: 'Los Angeles',
		neighborhood: 'Echo Park',
		category: 'drink'
	},
	{
		query: 'Tabula Rasa Bar Los Angeles',
		city: 'Los Angeles',
		neighborhood: 'Thai Town',
		category: 'drink'
	},
	{
		query: 'Thunderbolt Los Angeles',
		city: 'Los Angeles',
		neighborhood: 'Historic Filipinotown',
		category: 'drink'
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
	{ query: 'Bar Trench Ebisu Tokyo', city: 'Tokyo', neighborhood: 'Ebisu', category: 'drink' },
	{
		query: 'Tsuta ramen Tokyo',
		city: 'Tokyo',
		neighborhood: 'Yoyogi-Uehara',
		category: 'eat'
	},
	{
		query: 'Sushi Saito Roppongi Tokyo',
		city: 'Tokyo',
		neighborhood: 'Roppongi',
		category: 'eat'
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
		category: 'eat'
	},
	{
		query: 'Gen Yamamoto Azabu-Juban',
		city: 'Tokyo',
		neighborhood: 'Azabu-Juban',
		category: 'drink'
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
		category: 'eat'
	},
	{
		query: 'Bear Pond Espresso Shimokitazawa',
		city: 'Tokyo',
		neighborhood: 'Shimokitazawa',
		category: 'shop'
	},
	{ query: 'SG Club Shibuya Tokyo', city: 'Tokyo', neighborhood: 'Shibuya', category: 'drink' },
	{ query: 'Daikanyama T-Site', city: 'Tokyo', neighborhood: 'Daikanyama', category: 'shop' }
];

// --- Cache plumbing -------------------------------------------------------

type CachedPlace = {
	muid: string;
	name: string;
	city: string;
	category: 'eat' | 'drink' | 'shop' | 'visit';
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
	categoryOverride?: 'eat' | 'drink' | 'shop' | 'visit'
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

// --- Invites & waitlist -----------------------------------------------------
//
// Gives the admin panel's Users/Invites/Waitlist tabs something to show.
// Each persona gets 3 invites (mirrors createInvitesFor's real default). A
// few form simple invite chains (A invited B) so the admin ledger shows
// redemptions and "referredByName" isn't blank for everyone; the rest sit
// unredeemed. Two waitlist entries are pre-admitted (status 'invited') to
// exercise that path too, minted from a spare invite rather than a chain slot.

const INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I, mirrors $lib/server/invites.ts
function generateDemoInviteCode(): string {
	const bytes = randomBytes(12);
	let raw = '';
	for (let i = 0; i < 12; i++) raw += INVITE_ALPHABET[bytes[i] % INVITE_ALPHABET.length];
	return [raw.slice(0, 4), raw.slice(4, 8), raw.slice(8, 12)].join('-');
}

/** `from` invited `to` - one of `from`'s 3 invite slots is redeemed by `to`. */
const INVITE_CHAINS: { from: string; to: string }[] = [
	{ from: 'maya@demo.curiomancer', to: 'sam@demo.curiomancer' },
	{ from: 'sam@demo.curiomancer', to: 'leo@demo.curiomancer' },
	{ from: 'leo@demo.curiomancer', to: 'yuki@demo.curiomancer' },
	{ from: 'aiden@demo.curiomancer', to: 'camille@demo.curiomancer' },
	{ from: 'camille@demo.curiomancer', to: 'marcus@demo.curiomancer' },
	{ from: 'marcus@demo.curiomancer', to: 'priya@demo.curiomancer' },
	{ from: 'priya@demo.curiomancer', to: 'theo@demo.curiomancer' }
];

const WAITLIST_ENTRIES: { email: string; city: string; status: 'pending' | 'invited' }[] = [
	{ email: 'jordan@demo.curiomancer', city: 'Los Angeles', status: 'pending' },
	{ email: 'ren@demo.curiomancer', city: 'Tokyo', status: 'pending' },
	{ email: 'noa@demo.curiomancer', city: 'Los Angeles', status: 'pending' },
	{ email: 'kenji@demo.curiomancer', city: 'Tokyo', status: 'invited' },
	{ email: 'ivy@demo.curiomancer', city: 'Los Angeles', status: 'invited' }
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

console.log('Clearing previous demo personas and their data…');
// Scoped to demo persona users only - never touches real accounts or places
// they've added. `place` is deliberately never deleted; see the upsert below.
const staleDemoUsers = await db
	.select({ id: user.id })
	.from(user)
	.where(or(...DEMO_EMAIL_PATTERNS.map((p) => like(user.email, p))));
const staleDemoUserIds = staleDemoUsers.map((u) => u.id);
if (staleDemoUserIds.length > 0) {
	await db.delete(placeRelation).where(inArray(placeRelation.userId, staleDemoUserIds));
	await db.delete(userLocation).where(inArray(userLocation.userId, staleDemoUserIds));
	// Invites CREATED by a stale persona cascade-delete with them (FK ON
	// DELETE CASCADE on created_by_user_id); invites they REDEEMED just lose
	// that reference (ON DELETE SET NULL), which is fine to leave as-is.
	await db.delete(user).where(inArray(user.id, staleDemoUserIds));
}
// The `event` table has no real-app writer (only this seed populates it), so
// a full clear is safe here - unlike `place`, `placeRelation`, and
// `userLocation`, which real users write to.
await db.delete(event);
// Waitlist rows aren't tied to a user id (they're just an email + city), so
// unlike invites they don't cascade away with the personas above - clear
// them explicitly by the same demo email pattern.
await db.delete(waitlist).where(or(...DEMO_EMAIL_PATTERNS.map((p) => like(waitlist.email, p))));

console.log(`Upserting ${resolved.size} places (source=apple)…`);
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
// Upsert on the (source, externalId) dedupe key instead of delete+insert, so
// re-running this script reuses (rather than orphans or duplicates) a place
// row that a real user has already liked via the same Apple Maps POI.
const insertedPlaces = await db
	.insert(place)
	.values(placeRows)
	.onConflictDoUpdate({
		target: [place.source, place.externalId],
		targetWhere: dsql`${place.externalId} is not null`,
		set: {
			name: dsql`excluded.name`,
			category: dsql`excluded.category`,
			city: dsql`excluded.city`,
			neighborhood: dsql`excluded.neighborhood`,
			description: dsql`excluded.description`,
			latitude: dsql`excluded.latitude`,
			longitude: dsql`excluded.longitude`
		}
	})
	.returning();
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
	emailVerified: false,
	// Deterministic headshot per persona so re-seeding stays stable.
	image: `https://i.pravatar.cc/300?u=${encodeURIComponent(p.email)}`
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

console.log(`Minting ${PERSONAS.length * 3} invites (3 per persona, some redeemed)…`);
const redeemedToByFrom = new Map(INVITE_CHAINS.map((c) => [c.from, c.to]));
const inviteRows = PERSONAS.flatMap((p) => {
	const creatorId = userIdByEmail.get(p.email)!;
	const redeemedToEmail = redeemedToByFrom.get(p.email);
	const redeemedToId = redeemedToEmail ? userIdByEmail.get(redeemedToEmail) : undefined;
	return Array.from({ length: 3 }, (_, i) => ({
		id: generateDemoInviteCode(),
		createdByUserId: creatorId,
		// Only the first slot is ever the redeemed one, so each persona still
		// has invitesRemaining left over to show in the admin panel.
		redeemedByUserId: i === 0 && redeemedToId ? redeemedToId : null,
		redeemedAt: i === 0 && redeemedToId ? at(-3, 0) : null
	}));
});
await db.insert(invite).values(inviteRows);

console.log(`Seeding ${WAITLIST_ENTRIES.length} waitlist entries…`);
// Waitlist admits are minted from a spare persona's invite pool rather than
// one of the chain slots above, so they don't collide with the redemptions
// already wired up there.
const admitterId = userIdByEmail.get(PERSONAS[0].email)!;
const extraInviteRows: (typeof invite.$inferInsert)[] = [];
const waitlistRows = WAITLIST_ENTRIES.map((w) => {
	if (w.status === 'pending') return { email: w.email, city: w.city, status: w.status };
	const code = generateDemoInviteCode();
	extraInviteRows.push({ id: code, createdByUserId: admitterId });
	return {
		email: w.email,
		city: w.city,
		status: w.status,
		inviteId: code,
		invitedAt: at(-1, 0)
	};
});
if (extraInviteRows.length > 0) await db.insert(invite).values(extraInviteRows);
await db.insert(waitlist).values(waitlistRows);

console.log(
	`Done - ${resolved.size} places, ${EVENTS.length} events, ${PERSONAS.length} personas, ` +
		`${likeRows.length} likes, ${inviteRows.length + extraInviteRows.length} invites, ` +
		`${waitlistRows.length} waitlist entries.`
);
await sql.end();
