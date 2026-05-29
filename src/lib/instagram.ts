/**
 * Normalize an Instagram handle from free-form input. Accepts:
 *   "douglaslassance", "@douglaslassance", "instagram.com/douglaslassance"
 * Returns the bare handle (lowercase, no @, no URL) or null if invalid.
 *
 * Instagram handles allow letters, digits, periods, and underscores;
 * 1–30 chars. We're lenient on case (lowercased) and trim aggressively.
 */
const HANDLE_RE = /^[a-z0-9._]{1,30}$/;

export function parseInstagramHandle(input: string | null | undefined): string | null {
	if (!input) return null;
	let s = input.trim().toLowerCase();
	// Strip protocol + host if a full URL was pasted.
	s = s
		.replace(/^https?:\/\//, '')
		.replace(/^www\./, '')
		.replace(/^instagram\.com\//, '')
		.replace(/^\/+/, '');
	// Strip leading @ and trailing slash / query.
	s = s.replace(/^@/, '').replace(/\/.*$/, '').replace(/\?.*$/, '');
	if (!s) return null;
	return HANDLE_RE.test(s) ? s : null;
}

export function instagramUrl(handle: string | null | undefined): string | null {
	if (!handle) return null;
	const parsed = parseInstagramHandle(handle);
	return parsed ? `https://instagram.com/${parsed}` : null;
}
