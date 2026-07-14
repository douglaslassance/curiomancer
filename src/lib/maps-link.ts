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
	neighborhood?: string | null;
	city?: string | null;
}): string | null {
	const { latitude, longitude, name, neighborhood, city } = opts;
	// Prefer a name + location search so Google opens the actual business page
	// (reviews, hours, photos) rather than a bare coordinate pin. The
	// neighborhood + city narrow it to the right branch. Only fall back to raw
	// coordinates when we have no name. Every branch uses the ?api=1 universal
	// format - a single, valid query param, which works on web, iOS, and Android
	// and opens the native app if installed. (The old code wrongly appended the
	// web-path `/@lat,lng,17z` syntax inside `query=`, which Google can't parse.)
	if (name) {
		const q = [name, neighborhood, city].filter(Boolean).join(', ');
		return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
	}
	if (typeof latitude === 'number' && typeof longitude === 'number') {
		return `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
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
	neighborhood?: string | null;
	city?: string | null;
}): string | null {
	const { latitude, longitude, name, neighborhood, city } = opts;
	if (typeof latitude === 'number' && typeof longitude === 'number') {
		return `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;
	}
	if (name) {
		const q = [name, neighborhood, city].filter(Boolean).join(', ');
		return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(q)}`;
	}
	return null;
}
