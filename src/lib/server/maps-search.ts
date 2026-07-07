/**
 * Server-side place search via Apple's Maps Server API.
 *
 * Same `.p8` we use for MapKit JS - Apple uses one auth key for both.
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
	const jwt = await mintMapkitToken('https://curiomancer.local');

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
 * Reverse-geocode coordinates to a "City, Country" label via Apple, so the
 * splash "Detect" button yields the same style and source as the
 * autocomplete suggestions (rather than mixing in a second provider).
 */
export async function reverseGeocodeApple(lat: number, lng: number): Promise<string | null> {
	const token = await getAccessToken();

	const url = new URL(`${BASE}/v1/reverseGeocode`);
	url.searchParams.set('loc', `${lat},${lng}`);
	url.searchParams.set('lang', 'en-US');

	const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
	if (!res.ok) {
		throw new Error(`Apple Maps reverseGeocode returned ${res.status}: ${await res.text()}`);
	}

	const data = (await res.json()) as {
		results?: Array<{
			country?: string;
			structuredAddress?: {
				locality?: string;
				subLocality?: string;
				administrativeArea?: string;
			};
		}>;
	};

	const result = data.results?.[0];
	const addr = result?.structuredAddress;
	const city = addr?.locality || addr?.subLocality || addr?.administrativeArea;
	if (!city) return null;
	return result?.country ? `${city}, ${result.country}` : city;
}

/**
 * Forward-geocode a free-text place name (e.g. "Paris, France") to
 * coordinates via Apple. Used to plot waitlist entries on the join map -
 * best-effort, so callers should treat a null result as "skip this one"
 * rather than an error.
 */
export async function geocodeApple(
	query: string
): Promise<{ latitude: number; longitude: number } | null> {
	const token = await getAccessToken();

	const url = new URL(`${BASE}/v1/geocode`);
	url.searchParams.set('q', query);
	url.searchParams.set('lang', 'en-US');

	const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
	if (!res.ok) {
		throw new Error(`Apple Maps geocode returned ${res.status}: ${await res.text()}`);
	}

	const data = (await res.json()) as {
		results?: Array<{ coordinate?: { latitude: number; longitude: number } }>;
	};

	const coordinate = data.results?.[0]?.coordinate;
	return coordinate ? { latitude: coordinate.latitude, longitude: coordinate.longitude } : null;
}

export type PlaceCompletion = {
	/** Primary line, e.g. "Paris". */
	title: string;
	/** Secondary line, e.g. "France". Empty when Apple gives only one line. */
	subtitle: string;
};

/**
 * As-you-type place completions via Apple's searchAutocomplete endpoint.
 * Biased to addresses/localities (not business POIs) so it reads as a
 * city picker. Used by the public waitlist field.
 */
export async function autocompletePlaces(query: string): Promise<PlaceCompletion[]> {
	const token = await getAccessToken();

	const url = new URL(`${BASE}/v1/searchAutocomplete`);
	url.searchParams.set('q', query);
	url.searchParams.set('resultTypeFilter', 'Address');
	url.searchParams.set('lang', 'en-US');

	const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
	if (!res.ok) {
		throw new Error(`Apple Maps autocomplete returned ${res.status}: ${await res.text()}`);
	}

	const data = (await res.json()) as {
		results?: Array<{ displayLines?: string[] }>;
	};

	return (data.results ?? [])
		.map((r) => ({ title: r.displayLines?.[0] ?? '', subtitle: r.displayLines?.[1] ?? '' }))
		.filter((r) => r.title);
}

/**
 * Map Apple's poiCategory strings to our category enum (eat / drink / shop /
 * visit). Keep in sync with mapAppleCategoryClient.
 *
 * Matched exactly, not by substring: substring matching classified
 * "PublicTransport" as drink (contains "pub"), "Parking" as visit (contains
 * "park"), and so on. Unknown categories return null and the caller decides.
 * The extra tokens beyond the MapKit JS vocabulary cover synonyms the Server
 * API may return (e.g. CoffeeShop, GroceryStore).
 */
const EAT_CATEGORIES = new Set(['bakery', 'cafe', 'restaurant', 'coffeeshop', 'coffee', 'dessert']);
const DRINK_CATEGORIES = new Set([
	'brewery',
	'distillery',
	'nightlife',
	'winery',
	'bar',
	'pub',
	'brewpub'
]);
const SHOP_CATEGORIES = new Set([
	'store',
	'foodmarket',
	'bookstore',
	'clothingstore',
	'mall',
	'market',
	'grocerystore'
]);
const VISIT_CATEGORIES = new Set([
	'amusementpark',
	'aquarium',
	'beach',
	'campground',
	'castle',
	'fairground',
	'fortress',
	'landmark',
	'library',
	'marina',
	'movietheater',
	'museum',
	'musicvenue',
	'nationalmonument',
	'nationalpark',
	'park',
	'planetarium',
	'stadium',
	'theater',
	'zoo',
	'monument',
	'garden',
	'gallery',
	'observatory'
]);

export function mapAppleCategory(poiCategory?: string): 'eat' | 'drink' | 'shop' | 'visit' | null {
	if (!poiCategory) return null;
	const c = poiCategory.toLowerCase();
	if (EAT_CATEGORIES.has(c)) return 'eat';
	if (DRINK_CATEGORIES.has(c)) return 'drink';
	if (SHOP_CATEGORIES.has(c)) return 'shop';
	if (VISIT_CATEGORIES.has(c)) return 'visit';
	return null;
}
