/**
 * Resolves the display media for a place: its photo, and the venue website that
 * photo came from.
 *
 * The chain is two best-effort hops. The Apple Place ID gives us the venue's
 * website (via `fetchApplePlaceUrls`), and that website's Open Graph preview
 * image (`og:image`, the picture that shows when you paste a link into a
 * message) is the photo. A place with no website, or a site with no preview
 * image, resolves to `null` and the UI shows a placeholder. The website itself
 * is kept alongside so the place cards can link out to it.
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
import { eq, inArray, sql } from 'drizzle-orm';
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

export type ResolvedPlacePhoto = {
	url: string | null;
	source: string | null;
	website: string | null;
};

/**
 * Resolve the photo and website for an Apple-sourced place. Every field is
 * null when the place has no website; `url` alone is null when the site
 * exposes no usable preview image. Never throws: every failure mode collapses
 * to nulls so a caller can cache "nothing there" and move on.
 */
export async function resolvePlacePhoto(applePlaceId: string): Promise<ResolvedPlacePhoto> {
	const empty = { url: null, source: null, website: null };
	try {
		const urls = await fetchApplePlaceUrls(applePlaceId);
		const site = urls.find((u) => /^https?:\/\//i.test(u));
		if (!site) return empty;
		const image = await fetchPreviewImage(site);
		return { url: image, source: image ? 'website-og' : null, website: site };
	} catch {
		return empty;
	}
}

export type PlaceMedia = { url: string | null; website: string | null };

/**
 * Photo URLs for many places at once, cache only. Never resolves.
 *
 * The lazy per-place path (getOrResolvePlacePhoto) is right for one card on
 * screen, but a grid of twenty would fire twenty requests and, for anything
 * uncached, twenty live fetches to venue websites. This answers from
 * `place_photo` in a single query, so a list renders instantly and simply shows
 * no image where we have not resolved one yet. Cards that do get opened warm
 * the cache through the lazy path, so coverage grows on its own.
 *
 * Keyed by Apple Place ID. Places without one, or without a cached photo, are
 * absent from the result rather than present as null.
 */
export async function getCachedPlacePhotos(
	externalIds: (string | null)[]
): Promise<Record<string, string>> {
	const ids = [...new Set(externalIds.filter((id): id is string => !!id))];
	if (ids.length === 0) return {};
	const rows = await db
		.select({ externalId: placePhoto.externalId, url: placePhoto.url })
		.from(placePhoto)
		.where(inArray(placePhoto.externalId, ids));
	const out: Record<string, string> = {};
	for (const r of rows) if (r.url) out[r.externalId] = r.url;
	return out;
}

/**
 * Cache-first media lookup for an Apple Place ID. Returns the cached result if
 * we've resolved this place before (including a cached `null` for "checked, no
 * photo"), otherwise resolves once and stores the outcome. Keyed by Apple ID so
 * one lookup serves the place everywhere, saved or not.
 *
 * A row with a null `websiteCheckedAt` predates website caching, so it counts
 * as unresolved: it gets one re-resolution that fills the website in.
 */
export async function getOrResolvePlacePhoto(externalId: string): Promise<PlaceMedia> {
	const cached = await db
		.select({
			url: placePhoto.url,
			website: placePhoto.website,
			websiteCheckedAt: placePhoto.websiteCheckedAt
		})
		.from(placePhoto)
		.where(eq(placePhoto.externalId, externalId))
		.limit(1);
	if (cached[0]?.websiteCheckedAt) return { url: cached[0].url, website: cached[0].website };

	const resolved = await resolvePlacePhoto(externalId);
	const row = {
		url: resolved.url,
		source: resolved.source,
		website: resolved.website,
		// now() rather than a JS Date, so this lands on the same clock as the
		// defaultNow() `checkedAt` right next to it.
		websiteCheckedAt: sql`now()`
	};
	// onConflictDoUpdate: another request may have inserted first, and legacy
	// rows (no websiteCheckedAt) are here precisely to be updated in place.
	await db
		.insert(placePhoto)
		.values({ externalId, ...row })
		.onConflictDoUpdate({ target: placePhoto.externalId, set: row });
	return { url: resolved.url, website: resolved.website };
}

/**
 * Resolve the photo and website from either a saved place id or an Apple Place
 * ID directly. Shared by the web (`/api/place-photo`) and native
 * (`/api/v1/place-photo`) routes so they can't drift. Returns all-null when
 * there's nothing to resolve (a place with no Apple id), and the caller falls
 * back to the map.
 */
export async function getPlacePhotoFor(params: {
	placeId?: string | null;
	externalId?: string | null;
}): Promise<PlaceMedia> {
	let externalId = params.externalId ?? null;
	if (!externalId && params.placeId) {
		const rows = await db
			.select({ externalId: place.externalId })
			.from(place)
			.where(eq(place.id, params.placeId))
			.limit(1);
		externalId = rows[0]?.externalId ?? null;
	}
	if (!externalId) return { url: null, website: null };
	return getOrResolvePlacePhoto(externalId);
}
