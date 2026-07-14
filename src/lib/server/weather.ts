/**
 * Current-conditions weather via Open-Meteo (free, keyless).
 *
 * Cached in-memory for 15 minutes per rounded coordinate to avoid hammering
 * their service. Acceptable for a single-instance Node deploy; on a multi-
 * instance setup we'd want a shared cache (Redis) or to push this to the edge.
 *
 * Docs: https://open-meteo.com/en/docs
 */

const ENDPOINT = 'https://api.open-meteo.com/v1/forecast';
const TTL_MS = 15 * 60 * 1000;

export type Weather = {
	temperatureC: number;
	weatherCode: number;
	/** Human label for the WMO weather code. */
	description: string;
};

type CacheEntry = { value: Weather; expiresAt: number };
const cache = new Map<string, CacheEntry>();
const MAX_ENTRIES = 5000;

const cacheKey = (lat: number, lng: number) => `${lat.toFixed(2)}:${lng.toFixed(2)}`;

// Keep the cache from growing without bound on a long-lived process: drop
// expired entries first, then the oldest-inserted ones if still over the cap.
function evictIfNeeded(): void {
	if (cache.size < MAX_ENTRIES) return;
	const now = Date.now();
	for (const [k, v] of cache) if (v.expiresAt <= now) cache.delete(k);
	while (cache.size >= MAX_ENTRIES) {
		const oldest = cache.keys().next().value;
		if (oldest === undefined) break;
		cache.delete(oldest);
	}
}

export async function getCurrentWeather(latitude: number, longitude: number): Promise<Weather> {
	const key = cacheKey(latitude, longitude);
	const hit = cache.get(key);
	if (hit && hit.expiresAt > Date.now()) return hit.value;

	const url = new URL(ENDPOINT);
	url.searchParams.set('latitude', latitude.toString());
	url.searchParams.set('longitude', longitude.toString());
	url.searchParams.set('current', 'temperature_2m,weather_code');
	url.searchParams.set('timezone', 'auto');

	const res = await fetch(url);
	if (!res.ok) throw new Error(`Open-Meteo returned ${res.status}`);

	const data = (await res.json()) as {
		current?: { temperature_2m?: number; weather_code?: number };
	};

	const t = data.current?.temperature_2m;
	const code = data.current?.weather_code;
	if (typeof t !== 'number' || typeof code !== 'number') {
		throw new Error('Open-Meteo response missing current conditions');
	}

	const value: Weather = {
		temperatureC: Math.round(t),
		weatherCode: code,
		description: describeCode(code)
	};
	evictIfNeeded();
	cache.set(key, { value, expiresAt: Date.now() + TTL_MS });
	return value;
}

// WMO weather code mapping (subset). Full table:
// https://open-meteo.com/en/docs#weathervariables
function describeCode(code: number): string {
	if (code === 0) return 'Clear';
	if (code <= 2) return 'Partly cloudy';
	if (code === 3) return 'Overcast';
	if (code >= 45 && code <= 48) return 'Foggy';
	if (code >= 51 && code <= 57) return 'Drizzle';
	if (code >= 61 && code <= 67) return 'Rain';
	if (code >= 71 && code <= 77) return 'Snow';
	if (code >= 80 && code <= 82) return 'Rain showers';
	if (code >= 95) return 'Thunderstorm';
	return 'Mild';
}
