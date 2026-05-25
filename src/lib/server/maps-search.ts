/**
 * Server-side place search via Apple's Maps Server API.
 *
 * Same `.p8` we use for MapKit JS — Apple uses one auth key for both.
 * MapKit JS exposes a browser-side `mapkit.Search`; the HTTP API exists
 * for the Node-side path (seed scripts, server-side enrichment, etc.).
 *
 * Docs: https://developer.apple.com/documentation/applemapsserverapi/
 *
 * The Server API has a different auth flow than MapKit JS: instead of
 * signing a long-lived JWT and letting the browser hold it, we exchange
 * our JWT for a short-lived `accessToken` and use that as a Bearer.
 */
import { mintMapkitToken } from './mapkit';

const BASE = 'https://maps-api.apple.com';

let cachedAccessToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
	const now = Math.floor(Date.now() / 1000);
	if (cachedAccessToken && cachedAccessToken.expiresAt - 60 > now) {
		return cachedAccessToken.value;
	}

	// Origin for server-side calls is irrelevant; pass our own base URL so
	// the JWT's `sub` claim is well-formed.
	const jwt = await mintMapkitToken('https://bond.local');

	const res = await fetch(`${BASE}/v1/token`, {
		headers: { Authorization: `Bearer ${jwt}` }
	});
	if (!res.ok) {
		throw new Error(`Maps token exchange returned ${res.status}: ${await res.text()}`);
	}
	const data = (await res.json()) as { accessToken: string; expiresInSeconds: number };

	cachedAccessToken = {
		value: data.accessToken,
		expiresAt: now + data.expiresInSeconds
	};
	return cachedAccessToken.value;
}

export type AppleSearchResult = {
	muid: string;
	name: string;
	formattedAddress: string;
	latitude: number;
	longitude: number;
	/** Apple's POI category, e.g. 'Restaurant', 'Cafe', 'Bar'. */
	poiCategory?: string;
	locality?: string; // city
};

/**
 * Search Apple Maps POIs by free-text query, optionally biased by a
 * search region (lat/lng + span in degrees). Returns the raw results;
 * mapping Apple's category to our enum is the caller's job.
 */
export async function searchAppleMaps(
	query: string,
	options: { center?: { latitude: number; longitude: number }; resultTypeFilter?: 'Poi' } = {}
): Promise<AppleSearchResult[]> {
	const token = await getAccessToken();

	const url = new URL(`${BASE}/v1/search`);
	url.searchParams.set('q', query);
	url.searchParams.set('resultTypeFilter', options.resultTypeFilter ?? 'Poi');
	url.searchParams.set('lang', 'en-US');
	if (options.center) {
		// `searchLocation` biases results toward this point.
		url.searchParams.set(
			'searchLocation',
			`${options.center.latitude},${options.center.longitude}`
		);
	}

	const res = await fetch(url, {
		headers: { Authorization: `Bearer ${token}` }
	});
	if (!res.ok) {
		throw new Error(`Apple Maps search returned ${res.status}: ${await res.text()}`);
	}

	const data = (await res.json()) as {
		results?: Array<{
			id?: string;
			muid?: string;
			name?: string;
			formattedAddressLines?: string[];
			coordinate?: { latitude: number; longitude: number };
			poiCategory?: string;
			structuredAddress?: { locality?: string };
		}>;
	};

	return (data.results ?? [])
		.filter((r) => r.coordinate && (r.muid || r.id))
		.map((r) => ({
			muid: String(r.muid ?? r.id),
			name: r.name ?? '(unnamed)',
			formattedAddress: r.formattedAddressLines?.join(', ') ?? '',
			latitude: r.coordinate!.latitude,
			longitude: r.coordinate!.longitude,
			poiCategory: r.poiCategory,
			locality: r.structuredAddress?.locality
		}));
}

/**
 * Best-effort mapping of Apple's poiCategory strings to our 3-category enum.
 * Anything we can't classify returns null and the caller decides what to do.
 *
 * Apple has dozens of POI categories. We don't enumerate all of them — this
 * is a "the common ones we expect users to add" mapping. Add as we learn.
 */
export function mapAppleCategory(poiCategory?: string): 'restaurant' | 'bar' | 'shop' | null {
	if (!poiCategory) return null;
	const c = poiCategory.toLowerCase();

	if (
		['restaurant', 'cafe', 'bakery', 'foodmarket', 'fastfood'].some((needle) => c.includes(needle))
	) {
		return 'restaurant';
	}
	if (['bar', 'pub', 'brewery', 'winery', 'nightlife'].some((needle) => c.includes(needle))) {
		return 'bar';
	}
	if (
		['store', 'shop', 'bookstore', 'clothingstore', 'market'].some((needle) => c.includes(needle))
	) {
		return 'shop';
	}
	return null;
}
