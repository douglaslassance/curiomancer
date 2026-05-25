/**
 * Reverse-geocode lat/lng to a normalized city via OpenStreetMap's Nominatim.
 *
 * Nominatim is free, keyless, and rate-limited to 1 req/sec; it requires
 * a User-Agent identifying the app. For Bond's scale (one request per
 * sign-in or location refresh) this is fine.
 *
 * Docs: https://nominatim.org/release-docs/develop/api/Reverse/
 */

const ENDPOINT = 'https://nominatim.openstreetmap.org/reverse';
const USER_AGENT = 'bond-app (contact: hey@bond.app)';

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
	const city =
		addr.city ??
		addr.town ??
		addr.village ??
		addr.municipality ??
		addr.county ??
		addr.state ??
		null;
	if (!city) {
		throw new Error('Could not determine city from coordinates');
	}

	return {
		city,
		countryCode: addr.country_code ? addr.country_code.toUpperCase() : null,
		timezone: guessTimezone(latitude, longitude, addr.country_code)
	};
}

/**
 * Very rough timezone guess. Good enough for header display when the browser
 * doesn't provide one. Falls back to UTC.
 */
function guessTimezone(_lat: number, _lng: number, countryCode?: string): string | null {
	// Map of a handful of countries we expect to see early. We can refine when
	// real users start showing up with weird timezones.
	const map: Record<string, string> = {
		us: 'America/Los_Angeles', // not always right, but a reasonable default for west-coast geo
		jp: 'Asia/Tokyo',
		fr: 'Europe/Paris',
		gb: 'Europe/London',
		de: 'Europe/Berlin',
		ca: 'America/Toronto',
		au: 'Australia/Sydney'
	};
	if (countryCode && map[countryCode.toLowerCase()]) return map[countryCode.toLowerCase()];
	return null;
}
