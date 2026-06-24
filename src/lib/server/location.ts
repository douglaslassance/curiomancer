/**
 * Reverse-geocode lat/lng to a normalized city via OpenStreetMap's Nominatim.
 *
 * Nominatim is free, keyless, and rate-limited to 1 req/sec; it requires
 * a User-Agent identifying the app. For Curiomancer's scale (one request per
 * sign-in or location refresh) this is fine.
 *
 * Docs: https://nominatim.org/release-docs/develop/api/Reverse/
 */

const ENDPOINT = 'https://nominatim.openstreetmap.org/reverse';
const USER_AGENT = 'curiomancer-app (contact: hey@curiomancer.app)';

export type ResolvedLocation = {
	city: string;
	countryCode: string | null;
	/** IANA timezone, best-effort guess from country/coords; null if unknown. */
	timezone: string | null;
};

type NominatimResponse = {
	address?: {
		city?: string;
		town?: string;
		village?: string;
		municipality?: string;
		county?: string;
		state?: string;
		country_code?: string;
	};
};

/**
 * Returns the best city-level name and country code for the given coordinates.
 * Throws on network or parse failure — the caller is expected to surface that
 * to the user as "couldn't determine your location."
 */
export async function reverseGeocode(
	latitude: number,
	longitude: number
): Promise<ResolvedLocation> {
	const url = new URL(ENDPOINT);
	url.searchParams.set('lat', latitude.toString());
	url.searchParams.set('lon', longitude.toString());
	url.searchParams.set('format', 'jsonv2');
	url.searchParams.set('zoom', '10'); // city-level
	url.searchParams.set('accept-language', 'en');

	const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
	if (!res.ok) {
		throw new Error(`Nominatim returned ${res.status}`);
	}

	const data = (await res.json()) as NominatimResponse;
	const addr = data.address ?? {};
	const rawCity =
		addr.city ??
		addr.town ??
		addr.village ??
		addr.municipality ??
		addr.county ??
		addr.state ??
		null;
	if (!rawCity) {
		throw new Error('Could not determine city from coordinates');
	}

	return {
		city: normalizeToMetro(rawCity),
		countryCode: addr.country_code ? addr.country_code.toUpperCase() : null,
		timezone: guessTimezone(latitude, longitude, addr.country_code)
	};
}

/**
 * Many world cities have administrative subdivisions Nominatim returns as
 * the "city" field, even though humans think of them as one metro. Map
 * those to their parent city so our string-equality matching works.
 *
 * The list is hand-picked — we'll grow it as users surface mismatches.
 * The long-term answer is distance-based matching (separate work item).
 */
const WARD_TO_METRO: Record<string, string> = {
	// Tokyo 23 special wards (英語 names; Japanese versions are also returned
	// by Nominatim depending on accept-language, but we ask for 'en')
	Adachi: 'Tokyo',
	Arakawa: 'Tokyo',
	Bunkyo: 'Tokyo',
	Chiyoda: 'Tokyo',
	Chuo: 'Tokyo',
	Edogawa: 'Tokyo',
	Itabashi: 'Tokyo',
	Katsushika: 'Tokyo',
	Kita: 'Tokyo',
	Koto: 'Tokyo',
	Meguro: 'Tokyo',
	Minato: 'Tokyo',
	Nakano: 'Tokyo',
	Nerima: 'Tokyo',
	Ota: 'Tokyo',
	Setagaya: 'Tokyo',
	Shibuya: 'Tokyo',
	Shinagawa: 'Tokyo',
	Shinjuku: 'Tokyo',
	Suginami: 'Tokyo',
	Sumida: 'Tokyo',
	Taito: 'Tokyo',
	Toshima: 'Tokyo',

	// NYC five boroughs
	Manhattan: 'New York',
	Brooklyn: 'New York',
	Queens: 'New York',
	'The Bronx': 'New York',
	Bronx: 'New York',
	'Staten Island': 'New York',

	// Common Paris arrondissements get returned as "Paris" by Nominatim
	// already, so no normalization needed there.

	// Seoul districts (gu/구) — partial list of the most-touristy
	'Gangnam-gu': 'Seoul',
	'Mapo-gu': 'Seoul',
	'Jongno-gu': 'Seoul',
	'Yongsan-gu': 'Seoul',

	// London boroughs are usually returned as "London"; the exceptions are
	// places people might call by their borough name in conversation.
	'City of Westminster': 'London',
	'City of London': 'London',
	Camden: 'London',
	Hackney: 'London',
	Islington: 'London'
};

export function normalizeToMetro(rawCity: string): string {
	return WARD_TO_METRO[rawCity] ?? rawCity;
}

/**
 * Very rough timezone guess. Good enough for header display when the browser
 * doesn't provide one. Falls back to UTC.
 */
function guessTimezone(_lat: number, _lng: number, countryCode?: string): string | null {
	const map: Record<string, string> = {
		us: 'America/Los_Angeles',
		jp: 'Asia/Tokyo',
		fr: 'Europe/Paris',
		gb: 'Europe/London',
		de: 'Europe/Berlin',
		ca: 'America/Toronto',
		au: 'Australia/Sydney',
		kr: 'Asia/Seoul'
	};
	if (countryCode && map[countryCode.toLowerCase()]) return map[countryCode.toLowerCase()];
	return null;
}
