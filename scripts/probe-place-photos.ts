/**
 * READ-ONLY coverage probe for the "place photos" question.
 *
 * It does not write to our database and does not modify any place. It only
 * SELECTs a random sample of places and makes outbound GET requests to
 * Apple, OpenStreetMap, and each venue's own site, then prints how often a
 * free image path exists. Nothing here touches place_relation, so it is
 * safe against the place-data rules in CLAUDE.md.
 *
 * It answers three things with real numbers instead of guesswork:
 *   1. Apple  - does GET /v1/place/{muid} accept our stored externalId at
 *               all, and does the Server API ever return a website/url field?
 *               (Two maintained SDKs say the Place object has no url field;
 *               this confirms it against our own data and logs the raw body.)
 *   2. OSM    - does Overpass have this venue, and does it carry a `website`
 *               tag and/or a usable `image` / `wikimedia_commons` tag?
 *   3. og     - for any website URL we find, does the page expose an og:image?
 *
 * Run with:  pnpm probe:place-photos
 * Env knobs: SAMPLE (default 40), SKIP_APPLE=1, SKIP_OSM=1, SKIP_OG=1
 *
 * Self-contained connection + token minting (like backfill-avatars-to-r2.ts),
 * because storage.ts / the app db read env through SvelteKit's $env alias,
 * which only exists inside the app runtime.
 */
import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { resolve as resolvePath } from 'node:path';
import postgres from 'postgres';
import { SignJWT, importPKCS8 } from 'jose';

const SAMPLE = Number(process.env.SAMPLE ?? 40);
const SKIP_APPLE = process.env.SKIP_APPLE === '1';
const SKIP_OSM = process.env.SKIP_OSM === '1';
const SKIP_OG = process.env.SKIP_OG === '1';
// A real browser UA helps when fetching venue sites for og:image.
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
	'(KHTML, like Gecko) Chrome/124.0 Safari/537.36';
// Overpass etiquette wants an identifying UA; a spoofed browser string gets a 406.
const OVERPASS_UA = 'curiomancer-place-photo-probe/1.0 (coverage test; hey@douglaslassance.me)';

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) throw new Error('DATABASE_URL is not set');
const sql = postgres(dbUrl);

// -- Apple auth: mirror src/lib/server/mapkit.ts, reading process.env ---------

async function loadPrivateKey() {
	const base64 = process.env.MAPKIT_PRIVATE_KEY_BASE64;
	const inline = process.env.MAPKIT_PRIVATE_KEY;
	const path = process.env.MAPKIT_KEY_PATH;
	let pem: string;
	if (base64) pem = Buffer.from(base64, 'base64').toString('utf8');
	else if (inline) pem = inline.includes('\\n') ? inline.replace(/\\n/g, '\n') : inline;
	else if (path) pem = await readFile(resolvePath(path), 'utf8');
	else throw new Error('Set MAPKIT_PRIVATE_KEY_BASE64, MAPKIT_PRIVATE_KEY, or MAPKIT_KEY_PATH');
	return importPKCS8(pem, 'ES256');
}

async function appleAccessToken(): Promise<string> {
	const teamId = process.env.APPLE_TEAM_ID;
	const keyId = process.env.MAPKIT_KEY_ID;
	if (!teamId) throw new Error('APPLE_TEAM_ID is not set');
	if (!keyId) throw new Error('MAPKIT_KEY_ID is not set');
	const key = await loadPrivateKey();
	const now = Math.floor(Date.now() / 1000);
	const jwt = await new SignJWT({})
		.setProtectedHeader({ alg: 'ES256', kid: keyId, typ: 'JWT' })
		.setIssuer(teamId)
		.setIssuedAt(now)
		.setExpirationTime(now + 1800)
		.setAudience('mapkit')
		.setSubject('https://curiomancer.local')
		.sign(key);
	const res = await fetch('https://maps-api.apple.com/v1/token', {
		headers: { Authorization: `Bearer ${jwt}` }
	});
	if (!res.ok) throw new Error(`token exchange ${res.status}: ${await res.text()}`);
	return ((await res.json()) as { accessToken: string }).accessToken;
}

// -- Probes -------------------------------------------------------------------

type AppleResult = { status: number; ok: boolean; urlFieldFound: string | null; keys: string[] };

/**
 * Look the place up by the externalId (Apple muid) we already store. Logs the
 * HTTP status so we learn whether muid is even a valid Place ID, and scans the
 * raw body for anything url-shaped so an undocumented field can't hide from us.
 */
async function appleLookup(muid: string, bearer: string): Promise<AppleResult> {
	const res = await fetch(`https://maps-api.apple.com/v1/place/${encodeURIComponent(muid)}`, {
		headers: { Authorization: `Bearer ${bearer}` }
	});
	const text = await res.text();
	let keys: string[] = [];
	let urlFieldFound: string | null = null;
	try {
		const body = JSON.parse(text);
		const place = body.results?.[0] ?? body;
		keys = Object.keys(place ?? {});
		for (const [k, v] of Object.entries(place ?? {})) {
			if (/url|web|site|link/i.test(k) || (typeof v === 'string' && /^https?:\/\//.test(v))) {
				urlFieldFound = `${k}=${JSON.stringify(v)}`;
				break;
			}
		}
	} catch {
		// Non-JSON body (e.g. an error page); keys stay empty.
	}
	return { status: res.status, ok: res.ok, urlFieldFound, keys };
}

type OsmResult = { matched: boolean; website: string | null; image: string | null; error?: boolean };

/** GET Overpass with an identifying UA, retrying once on a 429 rate-limit. */
async function overpassGet(query: string): Promise<{ status: number; elements: Array<{ tags?: Record<string, string> }> }> {
	const url = 'https://overpass-api.de/api/interpreter?data=' + encodeURIComponent(query);
	for (let attempt = 0; attempt < 2; attempt++) {
		const res = await fetch(url, { headers: { 'User-Agent': OVERPASS_UA, Accept: 'application/json' } });
		if (res.status === 429) {
			await sleep(6000);
			continue;
		}
		if (!res.ok) return { status: res.status, elements: [] };
		const data = (await res.json()) as { elements?: Array<{ tags?: Record<string, string> }> };
		return { status: res.status, elements: data.elements ?? [] };
	}
	return { status: 429, elements: [] };
}

const norm = (s: string) =>
	s
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[^a-z0-9]+/g, ' ')
		.trim();

/**
 * Ask Overpass for named features within ~70m of the coordinate, then keep the
 * one whose name overlaps ours. Reports a website tag and any direct image tag
 * (image or wikimedia_commons), since a direct image skips the scrape entirely.
 */
async function overpassLookup(name: string, lat: number, lon: number): Promise<OsmResult> {
	const q = `[out:json][timeout:25];(nwr(around:120,${lat},${lon})["name"];);out tags center 50;`;
	const { status, elements } = await overpassGet(q);
	if (status !== 200) return { matched: false, website: null, image: null, error: true };
	const data = { elements };
	const want = norm(name);
	const wantWords = new Set(want.split(' ').filter((w) => w.length > 2));
	let best: Record<string, string> | null = null;
	let bestScore = 0;
	for (const el of data.elements ?? []) {
		const tags = el.tags ?? {};
		const n = norm(tags.name ?? '');
		if (!n) continue;
		let score = 0;
		if (n === want) score = 100;
		else if (n.includes(want) || want.includes(n)) score = 80;
		else {
			const words = n.split(' ');
			const hits = words.filter((w) => wantWords.has(w)).length;
			score = wantWords.size ? (hits / wantWords.size) * 60 : 0;
		}
		if (score > bestScore) {
			bestScore = score;
			best = tags;
		}
	}
	if (!best || bestScore < 50) return { matched: false, website: null, image: null };
	return {
		matched: true,
		website: best.website ?? best['contact:website'] ?? best.url ?? null,
		image: best.image ?? (best.wikimedia_commons ? `commons:${best.wikimedia_commons}` : null)
	};
}

/** Fetch a page and pull an og:image (or twitter:image) if present. */
async function ogImage(url: string): Promise<string | null> {
	const ctrl = new AbortController();
	const timer = setTimeout(() => ctrl.abort(), 8000);
	try {
		const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: ctrl.signal });
		if (!res.ok) return null;
		const html = (await res.text()).slice(0, 200_000);
		const patterns = [
			/<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)(?::url)?["'][^>]+content=["']([^"']+)["']/i,
			/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:image|twitter:image)(?::url)?["']/i
		];
		for (const p of patterns) {
			const m = html.match(p);
			if (m?.[1]) return new URL(m[1], url).toString();
		}
		return null;
	} catch {
		return null;
	} finally {
		clearTimeout(timer);
	}
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// -- Main ---------------------------------------------------------------------

async function main() {
	const rows = await sql<
		Array<{
			id: string;
			name: string;
			city: string;
			neighborhood: string | null;
			latitude: number;
			longitude: number;
			external_id: string | null;
		}>
	>`
		select id, name, city, neighborhood, latitude, longitude, external_id
		from place
		where latitude is not null and longitude is not null
			and source = 'apple' and external_id is not null
		order by random()
		limit ${SAMPLE}
	`;

	console.log(`Sampled ${rows.length} apple-sourced places with coordinates.\n`);
	if (rows.length === 0) {
		console.log('No matching places. Is DATABASE_URL pointing at a seeded database?');
		await sql.end();
		return;
	}

	const bearer = SKIP_APPLE ? '' : await appleAccessToken();
	const results: Array<Record<string, unknown>> = [];

	// Tallies for the summary.
	let appleOk = 0;
	let appleUrl = 0;
	let osmMatched = 0;
	let osmWebsite = 0;
	let osmImage = 0;
	let osmError = 0;
	let ogHits = 0;
	let anyWebsite = 0;
	let anyImagePath = 0;

	for (const [i, p] of rows.entries()) {
		const flags: string[] = [];
		let apple: AppleResult | null = null;
		let osm: OsmResult | null = null;
		let websiteUrl: string | null = null;
		let og: string | null = null;

		if (!SKIP_APPLE && p.external_id) {
			try {
				apple = await appleLookup(p.external_id, bearer);
				if (apple.ok) appleOk++;
				if (apple.urlFieldFound) {
					appleUrl++;
					websiteUrl = websiteUrl ?? apple.urlFieldFound.split('=')[1]?.replace(/^"|"$/g, '');
				}
				flags.push(`apple:${apple.status}${apple.urlFieldFound ? '+url' : ''}`);
			} catch (e) {
				flags.push(`apple:ERR`);
				apple = { status: 0, ok: false, urlFieldFound: null, keys: [String(e)] };
			}
		}

		if (!SKIP_OSM) {
			try {
				osm = await overpassLookup(p.name, p.latitude, p.longitude);
				if (osm.error) osmError++;
				if (osm.matched) osmMatched++;
				if (osm.website) {
					osmWebsite++;
					websiteUrl = websiteUrl ?? osm.website;
				}
				if (osm.image) osmImage++;
				flags.push(
					osm.error
						? 'osm:ERR'
						: `osm:${osm.matched ? 'hit' : 'miss'}${osm.website ? '+web' : ''}${osm.image ? '+img' : ''}`
				);
			} catch {
				osmError++;
				flags.push('osm:ERR');
			}
			await sleep(2500); // Be polite to the public Overpass endpoint.
		}

		if (websiteUrl) anyWebsite++;
		if (!SKIP_OG && websiteUrl) {
			og = await ogImage(websiteUrl);
			if (og) {
				ogHits++;
				flags.push('og:yes');
			} else {
				flags.push('og:no');
			}
		}

		const hasImagePath = Boolean(og) || Boolean(osm?.image);
		if (hasImagePath) anyImagePath++;

		console.log(
			`${String(i + 1).padStart(2)}. ${p.name} (${p.neighborhood ?? p.city}) ` +
				`  ${flags.join(' ')}${hasImagePath ? '  <= IMAGE' : ''}`
		);

		results.push({
			id: p.id,
			name: p.name,
			city: p.city,
			latitude: p.latitude,
			longitude: p.longitude,
			externalId: p.external_id,
			apple,
			osm,
			websiteUrl,
			ogImage: og,
			hasImagePath
		});
	}

	const pct = (n: number) => `${((n / rows.length) * 100).toFixed(0)}%`;
	console.log('\n' + '='.repeat(60));
	console.log(`SAMPLE                 ${rows.length}`);
	if (!SKIP_APPLE) {
		console.log(`apple lookup 2xx       ${appleOk} (${pct(appleOk)})`);
		console.log(`apple returned a url   ${appleUrl} (${pct(appleUrl)})`);
	}
	if (!SKIP_OSM) {
		console.log(`osm matched            ${osmMatched} (${pct(osmMatched)})`);
		console.log(`osm has website tag    ${osmWebsite} (${pct(osmWebsite)})`);
		console.log(`osm has direct image   ${osmImage} (${pct(osmImage)})`);
		console.log(`osm request errors     ${osmError} (${pct(osmError)})  <- rate-limit/failed, not true misses`);
	}
	console.log(`any website url         ${anyWebsite} (${pct(anyWebsite)})`);
	if (!SKIP_OG) console.log(`website had og:image   ${ogHits} (${pct(ogHits)})`);
	console.log(`ANY FREE IMAGE PATH    ${anyImagePath} (${pct(anyImagePath)})`);
	console.log('='.repeat(60));

	// One Apple raw key-set, so we can eyeball what the Server API really returns.
	const firstApple = results.find((r) => (r.apple as AppleResult | null)?.ok);
	if (firstApple) {
		console.log('\nApple Place object keys (first 2xx):');
		console.log('  ', (firstApple.apple as AppleResult).keys.join(', ') || '(none / non-JSON)');
	}

	const out = `${process.env.PROBE_OUT ?? '/tmp'}/place-photo-probe.json`;
	try {
		const { writeFile } = await import('node:fs/promises');
		await writeFile(out, JSON.stringify(results, null, 2));
		console.log(`\nFull per-place detail written to ${out}`);
	} catch {
		// Ignore; the console table above is the primary output.
	}

	await sql.end();
}

main().catch(async (e) => {
	console.error(e);
	await sql.end();
	process.exit(1);
});
