/**
 * Builds an "open in Google Maps" URL. Falls back to a name+city search if
 * coordinates aren't available. Returns null when we have neither, so the
 * caller can hide the button entirely.
 *
 * We deliberately use Google's universal search URL - works on web, iOS,
 * and Android, opens the native app if installed.
 */
export function googleMapsUrl(opts: {
	latitude?: number | null;
	longitude?: number | null;
	name?: string | null;
	city?: string | null;
}): string | null {
	const { latitude, longitude, name, city } = opts;
	if (typeof latitude === 'number' && typeof longitude === 'number') {
		const q = name
			? `${encodeURIComponent(name)}/@${latitude},${longitude},17z`
			: `${latitude},${longitude}`;
		return `https://www.google.com/maps/search/?api=1&query=${q}`;
	}
	if (name) {
		const q = city ? `${name} ${city}` : name;
		return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
	}
	return null;
}

/**
 * Builds a Google Maps "directions to here" URL (origin is the user's current
 * location, filled in by Google). Prefers exact coordinates; falls back to a
 * name+city destination. Returns null when we have neither. Works on web, iOS,
 * and Android, opening the native app if installed.
 */
export function googleDirectionsUrl(opts: {
	latitude?: number | null;
	longitude?: number | null;
	name?: string | null;
	city?: string | null;
}): string | null {
	const { latitude, longitude, name, city } = opts;
	if (typeof latitude === 'number' && typeof longitude === 'number') {
		return `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;
	}
	if (name) {
		const q = city ? `${name} ${city}` : name;
		return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(q)}`;
	}
	return null;
}
