<script lang="ts">
	import { onMount } from 'svelte';
	import type { Place } from '$lib/server/db/schema';
	import { categoryGlyphDataUri } from '$lib/map-glyphs';

	let {
		places,
		center,
		likedIds = [],
		zoom = 12
	}: {
		places: Place[];
		center: { latitude: number; longitude: number };
		likedIds?: string[];
		zoom?: number;
	} = $props();

	let mapElement: HTMLDivElement;
	let status = $state<'loading' | 'ready' | 'error'>('loading');
	let errorMessage = $state<string | null>(null);
	let selectedPlace = $state<Place | null>(null);

	const likedSet = $derived(new Set(likedIds));

	/** Load the MapKit JS SDK by injecting a <script> tag. Idempotent. */
	function loadMapKitScript(): Promise<void> {
		if (typeof window === 'undefined') return Promise.resolve();
		if (window.mapkit) return Promise.resolve();

		return new Promise((resolve, reject) => {
			const existing = document.querySelector('script[data-mapkit]');
			if (existing) {
				existing.addEventListener('load', () => resolve());
				existing.addEventListener('error', () => reject(new Error('MapKit script failed to load')));
				return;
			}
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

	async function fetchToken(): Promise<string> {
		const res = await fetch('/api/mapkit-token');
		if (!res.ok) throw new Error(`Token endpoint returned ${res.status}`);
		const data = (await res.json()) as { token: string };
		return data.token;
	}

	/**
	 * Pin color encodes the user's *relationship* to the place, not the
	 * category. Category is encoded by the glyph icon.
	 *  - liked     → pink-500
	 *  - otherwise → gray-400 ("recommended" / neutral)
	 */
	function pinColor(placeId: string): string {
		return likedSet.has(placeId) ? '#ec4899' : '#9ca3af';
	}

	onMount(() => {
		let map: any = null; // eslint-disable-line @typescript-eslint/no-explicit-any
		let cancelled = false;

		(async () => {
			try {
				await loadMapKitScript();
				if (cancelled) return;

				window.mapkit.init({
					authorizationCallback: (done: (token: string) => void) => {
						fetchToken()
							.then(done)
							.catch((err) => {
								console.error('MapKit token fetch failed:', err);
								status = 'error';
								errorMessage = 'Could not authenticate the map.';
							});
					},
					language: navigator.language
				});

				map = new window.mapkit.Map(mapElement, {
					center: new window.mapkit.Coordinate(center.latitude, center.longitude),
					cameraDistance: 50_000 / Math.pow(2, zoom - 12),
					showsCompass: window.mapkit.FeatureVisibility.Hidden,
					showsZoomControl: false,
					showsMapTypeControl: false,
					colorScheme: window.matchMedia?.('(prefers-color-scheme: dark)').matches
						? window.mapkit.Map.ColorSchemes.Dark
						: window.mapkit.Map.ColorSchemes.Light
				});

				// Drop a marker for each place with coords.
				const annotations = places
					.filter((p) => p.latitude !== null && p.longitude !== null)
					.map((p) => {
						const coord = new window.mapkit.Coordinate(p.latitude!, p.longitude!);
						const glyph = categoryGlyphDataUri(p.category);
						const ann = new window.mapkit.MarkerAnnotation(coord, {
							title: p.name,
							subtitle: p.neighborhood ?? p.city,
							color: pinColor(p.id),
							glyphImage: { 1: glyph, 2: glyph, 3: glyph }
						});
						ann.data = p;
						ann.addEventListener('select', () => {
							selectedPlace = p;
						});
						ann.addEventListener('deselect', () => {
							setTimeout(() => {
								if (selectedPlace?.id === p.id) selectedPlace = null;
							}, 100);
						});
						return ann;
					});
				map.addAnnotations(annotations);

				if (!cancelled) status = 'ready';
			} catch (err) {
				console.error('MapKit init failed:', err);
				if (!cancelled) {
					status = 'error';
					errorMessage = err instanceof Error ? err.message : 'Map failed to load.';
				}
			}
		})();

		return () => {
			cancelled = true;
			if (map) {
				try {
					map.destroy();
				} catch {
					/* MapKit doesn't always have destroy() — best effort. */
				}
			}
		};
	});
</script>

<div class="relative h-full w-full">
	<div bind:this={mapElement} class="absolute inset-0 bg-muted"></div>

	{#if status === 'loading'}
		<div
			class="bg-background/80 absolute inset-0 flex items-center justify-center backdrop-blur-sm"
		>
			<p class="text-muted-foreground text-sm">Loading map…</p>
		</div>
	{/if}

	{#if status === 'error'}
		<div
			class="bg-background/80 absolute inset-0 flex items-center justify-center backdrop-blur-sm"
		>
			<div class="bg-card max-w-sm rounded-xl border p-6 text-center">
				<p class="text-sm font-medium">Map could not load.</p>
				{#if errorMessage}
					<p class="text-muted-foreground mt-1 text-xs">{errorMessage}</p>
				{/if}
			</div>
		</div>
	{/if}

	{#if selectedPlace}
		<div
			class="bg-card pointer-events-auto absolute bottom-4 left-1/2 z-10 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 rounded-xl border p-4 shadow-lg"
		>
			<div class="flex items-start justify-between gap-3">
				<div>
					<h3 class="text-sm font-semibold">
						<a href={`/places/${selectedPlace.id}`} class="hover:underline">{selectedPlace.name}</a>
					</h3>
					<p class="text-muted-foreground mt-0.5 text-xs">
						{selectedPlace.neighborhood
							? `${selectedPlace.neighborhood}, ${selectedPlace.city}`
							: selectedPlace.city}
					</p>
				</div>
				<button
					type="button"
					class="text-muted-foreground hover:text-foreground text-xs"
					onclick={() => (selectedPlace = null)}
					aria-label="Close"
				>
					✕
				</button>
			</div>
			<p class="text-muted-foreground mt-2 line-clamp-3 text-xs">{selectedPlace.description}</p>
		</div>
	{/if}
</div>
