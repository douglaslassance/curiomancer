/**
 * Resolves a display photo for a place that has none of its own.
 *
 * The chain is two best-effort hops. The Apple Place ID gives us the venue's
 * website (via `fetchApplePlaceUrls`), and that website's Open Graph preview
 * image (`og:image`, the picture that shows when you paste a link into a
 * message) is the photo. A place with no website, or a site with no preview
 * image, resolves to `null` and the UI shows a placeholder.
 *
 * There are no user uploads and no paid photo providers by design, so this is
 * the entire photo pipeline. Callers cache the outcome, including the null
 * "checked, nothing there" case, so each place is resolved at most once.
 *
 * TODO(place-photo): cache the image bytes, not just the URL. Resolution is
 * cached in `place_photo`, but we store the venue's own og:image URL and the
 * client hotlinks it, so the image still loads from the venue's server every
 * view. Copy the bytes into S3/R2 under a `places/` prefix (reuse storage.ts,
 * today only `avatars/`) and store our own URL, so a venue changing, 404ing, or
 * blocking hotlinks can't break the photo. Deferred while user volume is low.
 */
import { eq } from 'drizzle-orm';
import { db } from './db';
import { place, placePhoto } from './db/schema';
import { fetchApplePlaceUrls } from './maps-search';

const BROWSER_UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
	'(KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const FETCH_TIMEOUT_MS = 8000;
const MAX_HTML_BYTES = 400_000;

/** Pull an og:image / twitter:image URL out of raw HTML, resolved absolute. */
function extractPreviewImage(html: string, base: string): string | null {
	const patterns = [
		/<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)(?::url)?["'][^>]+content=["']([^"']+)["']/i,
		/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:image|twitter:image)(?::url)?["']/i
	];
	for (const pattern of patterns) {
		const match = html.match(pattern);
		if (match?.[1]) {
			try {
				return new URL(match[1], base).toString();
			} catch {
				return null;
			}
		}
	}
	return null;
}

/** GET a page (with a timeout and byte cap) and return its preview image URL. */
async function fetchPreviewImage(siteUrl: string): Promise<string | null> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
	try {
		const res = await fetch(siteUrl, {
			headers: { 'User-Agent': BROWSER_UA },
			signal: controller.signal,
			redirect: 'follow'
		});
		if (!res.ok) return null;
		const html = (await res.text()).slice(0, MAX_HTML_BYTES);
		return extractPreviewImage(html, siteUrl);
	} catch {
		return null;
	} finally {
		clearTimeout(timer);
	}
}

export type ResolvedPlacePhoto = { url: string; source: string };

/**
 * Resolve a photo for an Apple-sourced place. Returns null when the place has
 * no website or the site exposes no usable preview image. Never throws: every
 * failure mode collapses to null so a caller can cache "no photo" and move on.
 */
export async function resolvePlacePhoto(applePlaceId: string): Promise<ResolvedPlacePhoto | null> {
	try {
		const urls = await fetchApplePlaceUrls(applePlaceId);
		const site = urls.find((u) => /^https?:\/\//i.test(u));
		if (!site) return null;
		const image = await fetchPreviewImage(site);
		return image ? { url: image, source: 'website-og' } : null;
	} catch {
		return null;
	}
}

/**
 * Cache-first photo lookup for an Apple Place ID. Returns the cached result if
 * we've resolved this place before (including a cached `null` for "checked, no
 * photo"), otherwise resolves once and stores the outcome. Keyed by Apple ID so
 * one lookup serves the place everywhere, saved or not.
 */
export async function getOrResolvePlacePhoto(externalId: string): Promise<{ url: string | null }> {
	const cached = await db
		.select({ url: placePhoto.url })
		.from(placePhoto)
		.where(eq(placePhoto.externalId, externalId))
		.limit(1);
	if (cached.length > 0) return { url: cached[0].url };

	const resolved = await resolvePlacePhoto(externalId);
	// onConflictDoNothing: a concurrent first-request may have inserted already.
	await db
		.insert(placePhoto)
		.values({ externalId, url: resolved?.url ?? null, source: resolved?.source ?? null })
		.onConflictDoNothing();
	return { url: resolved?.url ?? null };
}

/**
 * Resolve a photo from either a saved place id or an Apple Place ID directly.
 * Shared by the web (`/api/place-photo`) and native (`/api/v1/place-photo`)
 * routes so they can't drift. Returns `{ url: null }` when there's nothing to
 * resolve (a place with no Apple id), and the caller falls back to the map.
 */
export async function getPlacePhotoFor(params: {
	placeId?: string | null;
	externalId?: string | null;
}): Promise<{ url: string | null }> {
	let externalId = params.externalId ?? null;
	if (!externalId && params.placeId) {
		const rows = await db
			.select({ externalId: place.externalId })
			.from(place)
			.where(eq(place.id, params.placeId))
			.limit(1);
		externalId = rows[0]?.externalId ?? null;
	}
	if (!externalId) return { url: null };
	return getOrResolvePlacePhoto(externalId);
}
