/**
 * Parsing for Google Takeout "Saved" lists, used by the settings import flow.
 *
 * Google exports each saved list as its own CSV under Takeout > Saved:
 * `Favorite places.csv`, `Want to go.csv`, etc. Columns are
 * `Title,Note,URL,Tags,Comment`. Rows carry a name and a Google Maps URL but
 * no coordinates, so the server resolves each title against Apple Maps.
 *
 * This module is browser-safe (no server imports): the import page parses the
 * dropped files locally and only sends `{ title, kind }` rows to the server.
 */

export type ImportKind = 'liked' | 'want_to_go';

export type ImportRow = {
	title: string;
	/** The Google Maps URL, kept so the UI can link out for spot-checks. */
	url: string;
	/** Coordinates parsed from the Maps URL, when present. Used server-side to
	 * bias and disambiguate the Apple match so "Paradiso" resolves to the one
	 * you actually saved, not Apple's top global hit. */
	latitude?: number;
	longitude?: number;
	kind: ImportKind;
};

/**
 * Pull the place's coordinates out of a Google Maps URL. Takeout `/maps/place/`
 * links carry them two ways: the precise pin lives in the data blob as
 * `!3d<lat>!4d<lng>`, and the viewport center is in `@<lat>,<lng>`. We prefer
 * the pin and fall back to the viewport. Returns null for links without coords
 * (CID-only or shortened `goo.gl` URLs), leaving the server to name-only search.
 */
export function parseGoogleMapsCoords(url: string): { latitude: number; longitude: number } | null {
	if (!url) return null;
	// Precise pin: `...!3d34.0908!4d-118.2745...`
	const pin = url.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
	if (pin) return { latitude: Number(pin[1]), longitude: Number(pin[2]) };
	// Viewport center: `.../@34.0908,-118.2745,17z...`
	const at = url.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
	if (at) return { latitude: Number(at[1]), longitude: Number(at[2]) };
	return null;
}

/**
 * Map a Takeout CSV filename to the relation it represents. Favorites become
 * likes, "Want to go" becomes want_to_go. Anything else (custom lists, the
 * empty "Default list" files) returns null and is ignored.
 */
export function kindFromFilename(filename: string): ImportKind | null {
	const name = filename.toLowerCase();
	if (name.includes('favorite') || name.includes('favourite')) return 'liked';
	if (name.includes('want to go')) return 'want_to_go';
	return null;
}

export type Coords = { latitude: number; longitude: number };

/** One Apple Maps candidate for a title, returned by the resolve phase. */
export type Candidate = {
	muid: string;
	name: string;
	city: string;
	latitude: number;
	longitude: number;
	/** Already mapped to our category enum by the server. */
	category: string;
};

/** A title plus its Apple candidates (and its own coords, if the URL had any). */
export type ResolvedRow = {
	title: string;
	kind: ImportKind;
	latitude?: number;
	longitude?: number;
	candidates: Candidate[];
};

/**
 * When a row carries its own coordinates, the Apple hit must be within this far
 * of them or we reject it. When snapping an ambiguous name to a home region, we
 * allow more slack since a region centroid can sit a metro away from the pin.
 */
const MAX_MATCH_KM = 50;
const MAX_SNAP_KM = 120;

/** Great-circle distance in km between two lat/lng points. */
export function haversineKm(a: Coords, b: Coords): number {
	const R = 6371;
	const toRad = (d: number) => (d * Math.PI) / 180;
	const dLat = toRad(b.latitude - a.latitude);
	const dLng = toRad(b.longitude - a.longitude);
	const lat1 = toRad(a.latitude);
	const lat2 = toRad(b.latitude);
	const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
	return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Infer the user's "home regions" from where their places land. Each anchor
 * (a row's own coords, else its top Apple candidate) votes into a ~1-degree
 * grid cell; cells with enough votes are real regions (Seoul, Paris, ...),
 * while wrong disambiguations scatter thinly and fall below the bar. Returns
 * each surviving cell's centroid, densest first.
 */
export function computeHomeRegions(anchors: Coords[]): Coords[] {
	if (anchors.length === 0) return [];
	// A cell needs a few votes to count. Scale with list size so a big list
	// isn't dominated by a couple of stray hits, with a floor for small lists.
	const minCount = Math.max(3, Math.ceil(anchors.length * 0.03));

	const cells = new Map<string, { sumLat: number; sumLng: number; n: number }>();
	for (const a of anchors) {
		const key = `${Math.round(a.latitude)}_${Math.round(a.longitude)}`;
		const cell = cells.get(key) ?? { sumLat: 0, sumLng: 0, n: 0 };
		cell.sumLat += a.latitude;
		cell.sumLng += a.longitude;
		cell.n += 1;
		cells.set(key, cell);
	}

	return [...cells.values()]
		.filter((c) => c.n >= minCount)
		.sort((a, b) => b.n - a.n)
		.map((c) => ({ latitude: c.sumLat / c.n, longitude: c.sumLng / c.n }));
}

/**
 * Choose the best Apple candidate for a resolved row:
 *  1. If the row has its own coordinates (URL had them), take the nearest
 *     candidate within MAX_MATCH_KM, or null if none is close (wrong place).
 *  2. Otherwise snap to the candidate nearest a home region within MAX_SNAP_KM,
 *     so an ambiguous name lands where the user's other places are.
 *  3. Failing both, fall back to Apple's top hit.
 * Returns null only when there are no candidates or the row's own coords have
 * no nearby match.
 */
export function pickBestCandidate(row: ResolvedRow, regions: Coords[]): Candidate | null {
	const cands = row.candidates;
	if (cands.length === 0) return null;

	if (typeof row.latitude === 'number' && typeof row.longitude === 'number') {
		const origin = { latitude: row.latitude, longitude: row.longitude };
		let best: Candidate | null = null;
		let bestD = Infinity;
		for (const c of cands) {
			const d = haversineKm(origin, c);
			if (d < bestD) {
				bestD = d;
				best = c;
			}
		}
		return best && bestD <= MAX_MATCH_KM ? best : null;
	}

	if (regions.length > 0) {
		let best: Candidate | null = null;
		let bestD = Infinity;
		for (const c of cands) {
			let d = Infinity;
			for (const r of regions) d = Math.min(d, haversineKm(r, c));
			if (d < bestD) {
				bestD = d;
				best = c;
			}
		}
		if (best && bestD <= MAX_SNAP_KM) return best;
	}

	return cands[0];
}

/**
 * Minimal RFC 4180 CSV parser: handles quoted fields with embedded commas,
 * quotes ("" escapes), and newlines. Returns rows as arrays of cell strings.
 * Small enough to avoid pulling in a dependency for this one-off format.
 */
function parseCsv(text: string): string[][] {
	const rows: string[][] = [];
	let row: string[] = [];
	let field = '';
	let inQuotes = false;
	// Strip a leading UTF-8 BOM so the first header cell matches cleanly.
	const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

	for (let i = 0; i < src.length; i++) {
		const c = src[i];
		if (inQuotes) {
			if (c === '"') {
				if (src[i + 1] === '"') {
					field += '"';
					i++;
				} else {
					inQuotes = false;
				}
			} else {
				field += c;
			}
		} else if (c === '"') {
			inQuotes = true;
		} else if (c === ',') {
			row.push(field);
			field = '';
		} else if (c === '\n' || c === '\r') {
			// Swallow \r\n as a single break.
			if (c === '\r' && src[i + 1] === '\n') i++;
			row.push(field);
			field = '';
			rows.push(row);
			row = [];
		} else {
			field += c;
		}
	}
	// Flush the final field/row if the file didn't end with a newline.
	if (field !== '' || row.length > 0) {
		row.push(field);
		rows.push(row);
	}
	return rows;
}

/**
 * Parse one Takeout list file into import rows. `kind` is decided by the
 * caller from the filename. Drops the header, blank titles, and junk rows
 * (saved searches / dropped pins Google exports with a bare google.com URL).
 */
export function parseListFile(text: string, kind: ImportKind): ImportRow[] {
	const rows = parseCsv(text);
	if (rows.length === 0) return [];

	const header = rows[0].map((h) => h.trim().toLowerCase());
	const titleIdx = header.indexOf('title');
	const urlIdx = header.indexOf('url');
	if (titleIdx === -1) return [];

	const seen = new Set<string>();
	const out: ImportRow[] = [];
	for (let i = 1; i < rows.length; i++) {
		const title = (rows[i][titleIdx] ?? '').trim();
		if (!title) continue;
		const url = urlIdx === -1 ? '' : (rows[i][urlIdx] ?? '').trim();
		// A real saved place always carries a /maps/place/ URL. Bare
		// "google.com" rows are saved searches or dropped pins - skip them.
		if (url && !url.includes('/maps/place/')) continue;

		const key = title.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		const coords = parseGoogleMapsCoords(url);
		out.push({ title, url, latitude: coords?.latitude, longitude: coords?.longitude, kind });
	}
	return out;
}
