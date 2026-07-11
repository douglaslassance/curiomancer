<script lang="ts">
	import { onMount } from 'svelte';
	import { ensureMapKit } from '$lib/mapkit-client';
	import { categoryGlyphDataUri } from '$lib/map-glyphs';
	import type { Place } from '$lib/server/db/schema';

	// A small, non-interactive map centered on a single place, with one pin.
	// This deliberately mirrors the places/map view (map-view.svelte): create the
	// map in onMount, then add/refresh the marker in a separate $effect gated on
	// `status === 'ready'`. That is the flow that reliably shows a pin, so we copy
	// it rather than inventing our own timing.
	let {
		latitude,
		longitude,
		name,
		category
	}: {
		latitude: number;
		longitude: number;
		name: string;
		category: Place['category'];
	} = $props();

	let mapElement: HTMLDivElement;
	let status = $state<'loading' | 'ready' | 'error'>('loading');

	// Same roomy zoom the places/map view uses when it flies to a search result.
	const SPAN = 0.01;

	// Resolve the Curiomancer brand green for the pin. `--color-primary` is an
	// oklch() value under Tailwind v4, which MapKit's color parser can't read -
	// and modern browsers now keep oklch() in computed styles instead of
	// converting to rgb. So we rasterize it: paint one pixel and read its sRGB
	// bytes back, which always yields a plain rgb() string MapKit accepts.
	function brandPinColor(): string {
		const fallback = '#236d4d';
		const probe = document.createElement('span');
		probe.style.color = 'var(--color-primary)';
		document.body.appendChild(probe);
		const resolved = getComputedStyle(probe).color;
		probe.remove();
		const ctx = document.createElement('canvas').getContext('2d');
		if (!ctx) return fallback;
		ctx.fillStyle = resolved;
		ctx.fillRect(0, 0, 1, 1);
		const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
		return `rgb(${r}, ${g}, ${b})`;
	}

	// Non-reactive handle, assigned before `status` flips to 'ready' so the marker
	// effect (which gates on status) sees it.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let mapRef: any = null;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let marker: any = null;

	// Frame the place and (re)draw its pin. Same mechanics as map-view: assign
	// `region` directly and add a MarkerAnnotation with the category glyph. Runs
	// on ready and whenever the place changes as the viewer rates through the queue.
	$effect(() => {
		// Read place props up front so they're tracked even before the map is ready.
		const lat = latitude;
		const lng = longitude;
		const cat = category;
		void name;
		if (status !== 'ready' || !mapRef || !window.mapkit) return;

		const mk = window.mapkit;
		const coord = new mk.Coordinate(lat, lng);
		// Fly the camera to the place with a roomy zoom, then drop a highlighted
		// pin - byte-for-byte the same as map-view's "focus a search result" flow,
		// which is the one place a single pin is known to render reliably.
		mapRef.region = new mk.CoordinateRegion(coord, new mk.CoordinateSpan(SPAN, SPAN));

		if (marker) {
			mapRef.removeAnnotation(marker);
			marker = null;
		}
		const glyph = categoryGlyphDataUri(cat);
		marker = new mk.MarkerAnnotation(coord, {
			color: brandPinColor(),
			animates: true,
			selected: true,
			glyphImage: { 1: glyph, 2: glyph, 3: glyph }
		});
		mapRef.addAnnotation(marker);
	});

	onMount(() => {
		let cancelled = false;

		(async () => {
			try {
				await ensureMapKit();
				if (cancelled) return;

				// Create the map fully interactive, exactly like the places/map view -
				// locking it down with isZoomEnabled/isScrollEnabled: false can stop
				// MapKit from placing the annotation. We make it read-only instead with
				// `pointer-events: none` on the element (see markup below), so the map
				// still can't be panned/zoomed but the pin renders reliably.
				mapRef = new window.mapkit.Map(mapElement, {
					center: new window.mapkit.Coordinate(latitude, longitude),
					showsCompass: window.mapkit.FeatureVisibility.Hidden,
					showsZoomControl: false,
					showsMapTypeControl: false,
					showsPointsOfInterest: false,
					colorScheme: window.matchMedia?.('(prefers-color-scheme: dark)').matches
						? window.mapkit.Map.ColorSchemes.Dark
						: window.mapkit.Map.ColorSchemes.Light
				});

				// Assign the map, THEN flip status - the marker effect gates on
				// `status === 'ready'` and reads mapRef, exactly like map-view.
				if (!cancelled) status = 'ready';
			} catch (err) {
				console.error('Place map failed to load:', err);
				if (!cancelled) status = 'error';
			}
		})();

		return () => {
			cancelled = true;
			if (mapRef) {
				try {
					mapRef.destroy();
				} catch {
					/* MapKit doesn't always have destroy() - best effort. */
				}
			}
		};
	});
</script>

<div class="bg-muted relative h-full min-h-40 w-full overflow-hidden rounded-xl border">
	<!-- pointer-events-none keeps the map read-only (no pan/zoom) without locking
	     MapKit's interaction flags, which can suppress the annotation. -->
	<div bind:this={mapElement} class="pointer-events-none absolute inset-0"></div>

	{#if status === 'loading'}
		<div class="bg-background/80 absolute inset-0 flex items-center justify-center backdrop-blur-sm">
			<p class="text-muted-foreground text-sm">Loading map…</p>
		</div>
	{/if}

	{#if status === 'error'}
		<div class="bg-background/80 absolute inset-0 flex items-center justify-center backdrop-blur-sm">
			<p class="text-muted-foreground text-sm">Map could not load.</p>
		</div>
	{/if}
</div>
