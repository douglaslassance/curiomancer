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
	kind: ImportKind;
};

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
		out.push({ title, url, kind });
	}
	return out;
}
