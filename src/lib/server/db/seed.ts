/**
 * Demo seed: populates the local database with fictional users ("personas")
 * who have liked real-world places sourced from Apple Maps. Used to
 * demonstrate and stress-test the taste-matching algorithm without
 * waiting for organic user signal.
 *
 * Never runs in production. The places are real Apple Maps POIs exported from
 * production into places-fixture.json; the personas and their opinions are
 * entirely fabricated, and no production rating is ever copied.
 *
 * Run with: pnpm db:seed:demo
 *
 * Fully offline and deterministic: the catalogue is read from the committed
 * fixture, and personas are derived from it by a stable hash, so re-running
 * produces the same taste graph every time.
 */
import 'dotenv/config';
import { readFile } from 'node:fs/promises';
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

/** Matches both the current demo domain and the pre-rename "Bond" one. */
const DEMO_EMAIL_PATTERNS = ['%@demo.curiomancer', '%@demo.bond'];

// This script deletes personas and clears the `event` table. Refuse to run it
// against a production database - a stray prod DATABASE_URL in .env must never
// let a demo seed touch real data.
if (process.env.NODE_ENV === 'production') {
	throw new Error('Refusing to run the demo seed in production.');
}

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

const sql = postgres(url, { max: 1 });
const db = drizzle(sql);

// --- Place catalogue ------------------------------------------------------
//
// Real venues, exported from production by `pnpm pull:snapshot -- --places-fixture`
// and committed. Venue names and coordinates are not personal data, so unlike
// ratings they are safe to check in, and reading them from a file keeps the
// seed offline and deterministic (the old path resolved a hand-written hint
// list through Apple Maps on first run).
//
// Refresh it whenever production has meaningfully more places. Nothing here
// reads production at seed time.

type FixturePlace = {
	name: string;
	category: 'eat' | 'drink' | 'shop' | 'visit';
	city: string;
	neighborhood: string | null;
	description: string | null;
	latitude: number;
	longitude: number;
	external_id: string;
};

const FIXTURE_PATH = resolve(dirname(fileURLToPath(import.meta.url)), 'places-fixture.json');

/** Cities need enough places to host personas with distinct-but-overlapping taste. */
const MIN_PLACES_PER_CITY = 25;
/** How many cities personas live in. The rest of the catalogue still lands in
 *  the database, it just has nobody resident. */
const MAX_CITIES = 8;

async function readFixture(): Promise<FixturePlace[]> {
	try {
		const raw = await readFile(FIXTURE_PATH, 'utf8');
		return JSON.parse(raw) as FixturePlace[];
	} catch {
		throw new Error(
			`No place fixture at ${FIXTURE_PATH}.\n` +
				`Generate one with: pnpm pull:snapshot -- --places-fixture`
		);
	}
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
// Generated rather than hand-written, because the point of the demo data is to
// exercise matching, and matching needs pairs that actually clear
// MATCH_THRESHOLD. A hand-written list of ten people with four likes each
// produces zero twins, which is exactly the state production is in and the one
// state you cannot demo from.
//
// The construction: every place falls into one of TASTE_CLUSTERS buckets by a
// stable hash of its external id. A persona draws most of its opinions from one
// cluster, so two personas sharing a cluster overlap heavily and score as twins,
// while personas in different clusters barely overlap and stay strangers.
//
// Each persona also rates places in a hub city they do not live in, which is
// what produces cross-city twins: an LA resident and a Paris resident who match
// because they liked the same places on a trip. That is the actual product
// pitch, and no amount of single-city data demonstrates it.

/** Distinct taste groups. More clusters means sparser overlap. */
const TASTE_CLUSTERS = 4;
/** Personas per resident city. Above TASTE_CLUSTERS so some cities host two
 *  people of the same cluster, which is what produces same-city twins. */
const PERSONAS_PER_CITY = 5;
/** Opinions drawn from the persona's home city, inside its own cluster. This
 *  is most of a persona's history, so it also sets the cosine denominator: too
 *  few and every overlap reads as a near-perfect match. */
const HOME_PICKS = 14;
/** How far each persona's home window slides. Coprime-ish with HOME_PICKS so
 *  successive personas overlap partially rather than in lockstep. */
const WINDOW_STRIDE = 5;
/** Stagger between travel windows. Two personas of the same cluster share
 *  TRAVEL_PICKS minus their stagger distance, so hub overlap decays with
 *  distance instead of being all-or-nothing. */
const TRAVEL_STRIDE = 2;
/** Opinions from a cluster that is not theirs, recorded as dislikes. Prod has
 *  almost none, so without these the disagreement half of the score is dead. */
const DISLIKE_PICKS = 3;
/** Opinions in the shared hub city, which is what lets twins cross cities. */
const TRAVEL_PICKS = 6;
/** Bookmarks. No taste signal, they exist so the UI has want-to-go state. */
const WANT_TO_GO_PICKS = 4;

/** FNV-1a. Any stable hash works; this one keeps the seed dependency-free. */
function stableHash(input: string): number {
	let h = 0x811c9dc5;
	for (let i = 0; i < input.length; i++) {
		h ^= input.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	return h >>> 0;
}

function clusterOf(p: FixturePlace): number {
	return stableHash(p.external_id) % TASTE_CLUSTERS;
}

/** Deterministic slice, wrapping so a short pool still yields the full count. */
function window<T>(pool: T[], offset: number, count: number): T[] {
	if (pool.length === 0) return [];
	const out: T[] = [];
	for (let i = 0; i < Math.min(count, pool.length); i++) {
		out.push(pool[(offset + i) % pool.length]);
	}
	return out;
}

const FIRST_NAMES = [
	'Maya',
	'Sam',
	'Camille',
	'Marcus',
	'Yuki',
	'Aiden',
	'Priya',
	'Theo',
	'Hana',
	'Leo',
	'Noor',
	'Diego',
	'Ines',
	'Kenji',
	'Amara',
	'Felix',
	'Rosa',
	'Omar',
	'Lena',
	'Tomas',
	'Zara',
	'Nils',
	'Bea',
	'Ravi'
];
const LAST_NAMES = [
	'Tanaka',
	'Okafor',
	'Rivera',
	'Hill',
	'Mori',
	'Walsh',
	'Nair',
	'Adams',
	'Sato',
	'Dubois',
	'Haddad',
	'Alvarez',
	'Costa',
	'Ito',
	'Diallo',
	'Berger',
	'Marques',
	'Aziz',
	'Novak',
	'Silva',
	'Khan',
	'Larsen',
	'Font',
	'Menon'
];

type Persona = {
	name: string;
	email: string;
	city: string;
	latitude: number;
	longitude: number;
	cluster: number;
	/** externalId -> stance. One map so a place can never get two stances. */
	opinions: Map<string, 'liked' | 'disliked' | 'want_to_go'>;
};

/**
 * Build the persona set from whatever cities the fixture actually contains, so
 * this keeps working as the catalogue grows or shifts.
 */
function buildPersonas(places: FixturePlace[]): Persona[] {
	const byCity = new Map<string, FixturePlace[]>();
	for (const p of places) {
		// "Unknown" is the catch-all for places whose city never resolved; nobody
		// should live there.
		if (!p.city || p.city === 'Unknown') continue;
		const list = byCity.get(p.city) ?? [];
		list.push(p);
		byCity.set(p.city, list);
	}

	const cities = [...byCity.entries()]
		.filter(([, list]) => list.length >= MIN_PLACES_PER_CITY)
		.sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
		.slice(0, MAX_CITIES)
		.map(([city]) => city);

	if (cities.length === 0) {
		throw new Error(`No city in the fixture has ${MIN_PLACES_PER_CITY}+ places.`);
	}

	// The biggest city doubles as the hub everyone "travels" to.
	const hub = cities[0];

	/**
	 * A city's whole catalogue, ordered by how close each place sits to
	 * `cluster`. Own-cluster places come first, the opposite cluster last.
	 *
	 * Ordering the full list beats filtering to one cluster. Filtering leaves
	 * pools of a handful of places in smaller cities, so every window wraps onto
	 * the same few venues and personas end up holding near-identical histories,
	 * which scores as a perfect match. Here the pool is always the full city, so
	 * a window is always HOME_PICKS distinct places and overlap falls off with
	 * distance between windows.
	 */
	const affinityPool = (city: string, cluster: number) =>
		(byCity.get(city) ?? []).slice().sort((a, b) => {
			const da = (clusterOf(a) - cluster + TASTE_CLUSTERS) % TASTE_CLUSTERS;
			const db = (clusterOf(b) - cluster + TASTE_CLUSTERS) % TASTE_CLUSTERS;
			return da - db || a.external_id.localeCompare(b.external_id);
		});

	const personas: Persona[] = [];
	// Windows slide per (city, cluster) rather than per persona, so they stay
	// near the front of the affinity pool (inside the persona's own taste) and
	// two people of the same cluster in the same city overlap predictably.
	const seatByGroup = new Map<string, number>();
	let n = 0;
	for (const city of cities) {
		const sample = byCity.get(city)![0];
		for (let i = 0; i < PERSONAS_PER_CITY; i++) {
			const cluster = i % TASTE_CLUSTERS;
			// Slide by the persona's global index, not its index within the city:
			// keying off `i` alone left every window at zero, which made same-cluster
			// personas hold identical lists and score as near-perfect matches.
			const group = `${city}:${cluster}`;
			const seat = seatByGroup.get(group) ?? 0;
			seatByGroup.set(group, seat + 1);
			const homeOffset = seat * WINDOW_STRIDE;
			// Travel windows stagger by cluster seat too, so cross-city twins of the
			// same cluster share most of the hub but never all of it.
			const travelSeat = seatByGroup.get(`travel:${cluster}`) ?? 0;
			seatByGroup.set(`travel:${cluster}`, travelSeat + 1);
			const travelOffset = (travelSeat % 3) * TRAVEL_STRIDE;
			const first = FIRST_NAMES[n % FIRST_NAMES.length];
			// Shift the surname by one extra step on each wrap of the first names,
			// otherwise both indices cycle with the same period and persona 24 gets
			// persona 0's exact name, colliding on the unique email.
			const last = LAST_NAMES[(n * 7 + Math.floor(n / FIRST_NAMES.length)) % LAST_NAMES.length];
			const opinions = new Map<string, 'liked' | 'disliked' | 'want_to_go'>();

			for (const p of window(affinityPool(city, cluster), homeOffset, HOME_PICKS)) {
				opinions.set(p.external_id, 'liked');
			}
			// The hub is where personas of the same cluster meet regardless of where
			// they live, which is what makes cross-city twins possible at all.
			for (const p of window(affinityPool(hub, cluster), travelOffset, TRAVEL_PICKS)) {
				if (!opinions.has(p.external_id)) opinions.set(p.external_id, 'liked');
			}
			// Furthest from their taste, so shared dislikes mean something.
			const opposite = affinityPool(city, (cluster + 2) % TASTE_CLUSTERS);
			for (const p of window(opposite, homeOffset, DISLIKE_PICKS)) {
				if (!opinions.has(p.external_id)) opinions.set(p.external_id, 'disliked');
			}
			for (const p of window(
				affinityPool(city, (cluster + 1) % TASTE_CLUSTERS),
				homeOffset,
				WANT_TO_GO_PICKS
			)) {
				if (!opinions.has(p.external_id)) opinions.set(p.external_id, 'want_to_go');
			}

			personas.push({
				name: `${first} ${last}`,
				email: `${first.toLowerCase()}.${last.toLowerCase()}@demo.curiomancer`,
				city,
				latitude: sample.latitude,
				longitude: sample.longitude,
				cluster,
				opinions
			});
			n++;
		}
	}
	return personas;
}

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

const fixture = await readFixture();
const PERSONAS = buildPersonas(fixture);
const residentCities = [...new Set(PERSONAS.map((p) => p.city))];
console.log(
	`Loaded ${fixture.length} places from the fixture; ` +
		`${PERSONAS.length} personas across ${residentCities.length} cities ` +
		`(${residentCities.join(', ')})…`
);

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

console.log(`Upserting ${fixture.length} places (source=apple)…`);
const placeRows: NewPlace[] = fixture.map((r) => ({
	name: r.name,
	category: r.category,
	city: r.city,
	neighborhood: r.neighborhood,
	description: r.description ?? r.name,
	latitude: r.latitude,
	longitude: r.longitude,
	source: 'apple' as const,
	externalId: r.external_id
}));
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
// Keyed by Apple muid, which is what personas hold references to.
const placeIdByExternalId = new Map<string, string>();
for (const p of insertedPlaces) {
	if (p.externalId) placeIdByExternalId.set(p.externalId, p.id);
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
	longitude: p.longitude
}));
await db.insert(userLocation).values(locationRows);

const relationRows = PERSONAS.flatMap((p) =>
	[...p.opinions].flatMap(([externalId, kind]) => {
		const placeId = placeIdByExternalId.get(externalId);
		if (!placeId) return [];
		return [{ userId: userIdByEmail.get(p.email)!, placeId, kind }];
	})
);
if (relationRows.length > 0) await db.insert(placeRelation).values(relationRows);

console.log(`Minting ${PERSONAS.length * 3} invites (3 per persona, some redeemed)…`);
const redeemedToByFrom = new Map(INVITE_CHAINS.map((c) => [c.from, c.to]));
const inviteRows = PERSONAS.flatMap((p) => {
	const creatorId = userIdByEmail.get(p.email)!;
	const redeemedToEmail = redeemedToByFrom.get(p.email);
	const redeemedToId = redeemedToEmail ? userIdByEmail.get(redeemedToEmail) : undefined;
	return Array.from({ length: 3 }, (_, i) => ({
		id: generateDemoInviteCode(),
		// The persona created these invites. The first slot is the one that got
		// redeemed (invited the chain's `to` persona); the rest sit pending.
		createdByUserId: creatorId,
		invitedEmail: i === 0 ? (redeemedToEmail ?? null) : null,
		redeemedByUserId: i === 0 && redeemedToId ? redeemedToId : null,
		redeemedAt: i === 0 && redeemedToId ? at(-3, 0) : null
	}));
});
await db.insert(invite).values(inviteRows);

console.log(`Seeding ${WAITLIST_ENTRIES.length} waitlist entries…`);
// Admitted entries get a system invite (no creator) addressed to their email.
const extraInviteRows: (typeof invite.$inferInsert)[] = [];
const waitlistRows = WAITLIST_ENTRIES.map((w) => {
	if (w.status === 'pending') return { email: w.email, city: w.city, status: w.status };
	const code = generateDemoInviteCode();
	// Waitlist admits are unowned platform invites (creator only, no owner).
	extraInviteRows.push({ id: code, createdByUserId: null, invitedEmail: w.email });
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
	`Done - ${fixture.length} places, ${EVENTS.length} events, ${PERSONAS.length} personas, ` +
		`${relationRows.length} opinions, ${inviteRows.length + extraInviteRows.length} invites, ` +
		`${waitlistRows.length} waitlist entries.`
);
await sql.end();
