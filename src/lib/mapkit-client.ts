/**
 * Client-side MapKit JS loader, memoized across the app. Loads the script once
 * and initializes mapkit with a signed token from `/api/mapkit-token`. Both the
 * map view and the rate page use this so mapkit is only ever inited once, even
 * when navigating between them (double-init throws).
 *
 * `window.mapkit.__ccInited` is the shared "already initialized" flag; the map
 * component checks/sets it too so whichever route loads first wins.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

let readyPromise: Promise<any> | null = null;

function loadScript(): Promise<void> {
	if (typeof window === 'undefined') return Promise.reject(new Error('MapKit is browser-only.'));
	if (window.mapkit) return Promise.resolve();

	const existing = document.querySelector('script[data-mapkit]');
	if (existing) {
		return new Promise((resolve, reject) => {
			existing.addEventListener('load', () => resolve());
			existing.addEventListener('error', () => reject(new Error('MapKit script failed to load')));
		});
	}

	return new Promise((resolve, reject) => {
		const script = document.createElement('script');
		script.src = 'https://cdn.apple-mapkit.com/mk/5.x.x/mapkit.js';
		script.crossOrigin = 'anonymous';
		script.async = true;
		script.dataset.mapkit = 'true';
		script.onload = () => resolve();
		script.onerror = () => reject(new Error('MapKit script failed to load'));
		document.head.appendChild(script);
	});
}

/** Resolve the initialized `mapkit` global, loading + authorizing it on first call. */
export function ensureMapKit(): Promise<any> {
	if (readyPromise) return readyPromise;
	readyPromise = (async () => {
		await loadScript();
		const mapkit = window.mapkit;
		if (!mapkit.__ccInited) {
			mapkit.init({
				authorizationCallback: (done: (token: string) => void) => {
					fetch('/api/mapkit-token')
						.then((r) => r.json())
						.then((d) => done(d.token))
						.catch((err) => console.error('MapKit token fetch failed:', err));
				},
				language: navigator.language
			});
			mapkit.__ccInited = true;
		}
		return mapkit;
	})();
	return readyPromise;
}
