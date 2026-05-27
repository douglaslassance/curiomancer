<script lang="ts">
	import { onMount } from 'svelte';
	import type { Place } from '$lib/server/db/schema';
	import { categoryGlyphDataUri } from '$lib/map-glyphs';
	import PlacePopup from './place-popup.svelte';
	import MapSearch from './map-search.svelte';

	let {
		places,
		center,
		likedIds = [],
		dislikedIds = [],
		signedIn = false,
		zoom = 12
	}: {
		places: Place[];
		center: { latitude: number; longitude: number };
		likedIds?: string[];
		dislikedIds?: string[];
		signedIn?: boolean;
		zoom?: number;
	} = $props();

	let mapElement: HTMLDivElement;
	let status = $state<'loading' | 'ready' | 'error'>('loading');
	let errorMessage = $state<string | null>(null);
	let selectedPlace = $state<Place | null>(null);

	const likedSet = $derived(new Set(likedIds));
	const dislikedSet = $derived(new Set(dislikedIds));

	// Map handle held outside onMount so other functions can drive the camera.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let mapRef: any = null;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let previewMarker: any = null;
	// Annotations currently on the map for the `places` set, keyed by place id.
	// Held outside the reactive system so $effect can diff in-place rather
	// than tearing everything down on every render.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const placeAnnotations = new Map<string, any>();

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
	 * Pin color encodes the user's relationship: liked = pink, disliked =
	 * orange-red, neutral = gray. Category is the glyph icon.
	 */
	function pinColor(placeId: string): string {
		if (likedSet.has(placeId)) return '#ec4899'; // pink-500
		if (dislikedSet.has(placeId)) return '#f97316'; // orange-500
		return '#9ca3af'; // gray-400
	}

	function previewSelected(hit: {
		muid: string;
		name: string;
		latitude: number;
		longitude: number;
		category: 'restaurant' | 'bar' | 'shop' | null;
	}) {
		if (!mapRef || !window.mapkit) return;
		clearPreviewMarker();

		const coord = new window.mapkit.Coordinate(hit.latitude, hit.longitude);
		// Fly the camera to the result with a roomy zoom.
		mapRef.region = new window.mapkit.CoordinateRegion(
			coord,
			new window.mapkit.CoordinateSpan(0.01, 0.01)
		);

		const glyph = hit.category ? categoryGlyphDataUri(hit.category) : undefined;
		previewMarker = new window.mapkit.MarkerAnnotation(coord, {
			title: hit.name,
			color: '#facc15', // amber-400 — temporary, distinct from saved pins
			animates: true,
			selected: true,
			...(glyph ? { glyphImage: { 1: glyph, 2: glyph, 3: glyph } } : {})
		});
		mapRef.addAnnotation(previewMarker);
	}

	function clearPreviewMarker() {
		if (mapRef && previewMarker) {
			mapRef.removeAnnotation(previewMarker);
			previewMarker = null;
		}
	}

	onMount(() => {
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

				mapRef = new window.mapkit.Map(mapElement, {
					center: new window.mapkit.Coordinate(center.latitude, center.longitude),
					cameraDistance: 50_000 / Math.pow(2, zoom - 12),
					showsCompass: window.mapkit.FeatureVisibility.Hidden,
					showsZoomControl: false,
					showsMapTypeControl: false,
					colorScheme: window.matchMedia?.('(prefers-color-scheme: dark)').matches
						? window.mapkit.Map.ColorSchemes.Dark
						: window.mapkit.Map.ColorSchemes.Light
				});

				if (!cancelled) status = 'ready';
				// Annotation sync below runs in a separate $effect so changes to
				// places/likedIds/dislikedIds also trigger a re-render.
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
			if (mapRef) {
				try {
					mapRef.destroy();
				} catch {
					/* MapKit doesn't always have destroy() — best effort. */
				}
			}
		};
	});

	/**
	 * Sync map annotations to the current `places` set. Runs whenever the
	 * input array changes (e.g. server load returned a smaller set after
	 * a dislike) or pin colors should change (likedIds/dislikedIds shift).
	 *
	 * Diffs in-place so we don't pay a full rebuild every time:
	 *  - add annotations for places we haven't seen
	 *  - update color on existing ones if the relationship changed
	 *  - remove annotations for places no longer in the input
	 */
	$effect(() => {
		if (status !== 'ready' || !mapRef || !window.mapkit) return;

		const incoming = new Set<string>();
		const toAdd: unknown[] = [];

		for (const p of places) {
			if (p.latitude === null || p.longitude === null) continue;
			incoming.add(p.id);
			const desiredColor = pinColor(p.id);

			const existing = placeAnnotations.get(p.id);
			if (existing) {
				if (existing.color !== desiredColor) existing.color = desiredColor;
				continue;
			}

			const coord = new window.mapkit.Coordinate(p.latitude, p.longitude);
			const glyph = categoryGlyphDataUri(p.category);
			const ann = new window.mapkit.MarkerAnnotation(coord, {
				title: p.name,
				subtitle: p.neighborhood ?? p.city,
				color: desiredColor,
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
			placeAnnotations.set(p.id, ann);
			toAdd.push(ann);
		}

		if (toAdd.length > 0) mapRef.addAnnotations(toAdd);

		// Remove annotations for places no longer in the set.
		const toRemove: unknown[] = [];
		for (const [id, ann] of placeAnnotations) {
			if (!incoming.has(id)) {
				toRemove.push(ann);
				placeAnnotations.delete(id);
				if (selectedPlace?.id === id) selectedPlace = null;
			}
		}
		if (toRemove.length > 0) mapRef.removeAnnotations(toRemove);
	});
</script>

<div class="relative h-full w-full">
	<div bind:this={mapElement} class="absolute inset-0 bg-muted"></div>

	{#if status === 'ready'}
		<MapSearch
			{center}
			{signedIn}
			onPreview={previewSelected}
			onClearPreview={clearPreviewMarker}
		/>
	{/if}

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
		<PlacePopup placeId={selectedPlace.id} onClose={() => (selectedPlace = null)} />
	{/if}
</div>
