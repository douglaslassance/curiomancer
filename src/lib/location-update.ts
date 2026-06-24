/**
 * Shared client-side helper for "ask the browser where we are, then
 * tell the server." Used by the first-visit prompt and by the refresh
 * affordances on the dashboard header and settings page.
 *
 * Throws a `LocationUpdateError` (object, not Error subclass - Svelte
 * components want to read .message and .hint without instanceof) on
 * any failure so callers can render whatever UI fits.
 */
import { invalidateAll } from '$app/navigation';

export type LocationUpdateError = {
	message: string;
	hint?: string;
};

export async function updateLocation(): Promise<void> {
	if (typeof navigator === 'undefined' || !navigator.geolocation) {
		throw { message: 'Your browser does not support geolocation.' } satisfies LocationUpdateError;
	}

	let position: GeolocationPosition;
	try {
		position = await new Promise<GeolocationPosition>((resolve, reject) => {
			navigator.geolocation.getCurrentPosition(resolve, reject, {
				// Coarse wifi/IP positioning is faster and city-accurate.
				enableHighAccuracy: false,
				timeout: 20_000,
				// A manual refresh should not return a cached fix - the
				// whole point is that the user has moved.
				maximumAge: 0
			});
		});
	} catch (err) {
		throw geoErrorToFriendly(err);
	}

	const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
	const res = await fetch('/api/location', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			latitude: position.coords.latitude,
			longitude: position.coords.longitude,
			timezone
		})
	});
	if (!res.ok) {
		const text = await res.text().catch(() => '');
		throw { message: text || `Server returned ${res.status}` } satisfies LocationUpdateError;
	}
	await invalidateAll();
}

function geoErrorToFriendly(err: unknown): LocationUpdateError {
	if (err instanceof GeolocationPositionError) {
		switch (err.code) {
			case err.PERMISSION_DENIED:
				return {
					message: 'Location permission was denied.',
					hint: 'Allow location for this site in your browser, then try again.'
				};
			case err.POSITION_UNAVAILABLE:
				return {
					message: 'Your device could not determine its location.',
					hint: 'On macOS, check System Settings → Privacy & Security → Location Services and make sure your browser is allowed.'
				};
			case err.TIMEOUT:
				return {
					message: 'Timed out waiting for your location.',
					hint: 'Try again - sometimes the first attempt takes a moment.'
				};
			default:
				return { message: `Geolocation error (code ${err.code}).` };
		}
	}
	if (err instanceof Error) return { message: err.message };
	return { message: 'Something went wrong.' };
}
