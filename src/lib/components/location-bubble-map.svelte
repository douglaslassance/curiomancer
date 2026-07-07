<script lang="ts">
	import { onMount } from 'svelte';
	import { ensureMapKit } from '$lib/mapkit-client';

	type MapLocation = { latitude: number; longitude: number; count: number };

	let {
		locations,
		tooltipLabel = (count) => `${count} ${count === 1 ? 'person' : 'people'}`
	}: {
		locations: MapLocation[];
		/** Annotation hover text for a bubble's count, e.g. "4 people" or "4 users". */
		tooltipLabel?: (count: number) => string;
	} = $props();

	let mapElement: HTMLDivElement;
	let status = $state<'loading' | 'ready' | 'error'>('loading');

	// Area-correct bubble sizing: diameter grows with sqrt(count) so a 4x
	// bigger crowd reads as roughly 2x the radius, not 4x.
	const MIN_DIAMETER = 16;
	const MAX_DIAMETER = 64;
	function diameterFor(count: number, maxCount: number): number {
		if (maxCount <= 1) return MIN_DIAMETER;
		const t = Math.sqrt(count) / Math.sqrt(maxCount);
		return Math.round(MIN_DIAMETER + t * (MAX_DIAMETER - MIN_DIAMETER));
	}

	/** A translucent circle as an SVG data URI, for use as an ImageAnnotation. */
	function circleDataUri(diameter: number, color: string): string {
		const r = diameter / 2;
		const svg =
			`<svg xmlns="http://www.w3.org/2000/svg" width="${diameter}" height="${diameter}">` +
			`<circle cx="${r}" cy="${r}" r="${r - 1}" fill="${color}" fill-opacity="0.55" stroke="${color}" stroke-width="1.5"/>` +
			`</svg>`;
		return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
	}

	onMount(() => {
		let cancelled = false;

		(async () => {
			try {
				const mapkit = await ensureMapKit();
				if (cancelled) return;

				const map = new mapkit.Map(mapElement, {
					showsCompass: mapkit.FeatureVisibility.Hidden,
					showsZoomControl: false,
					showsMapTypeControl: false,
					showsPointsOfInterest: false,
					isRotationEnabled: false,
					colorScheme: window.matchMedia?.('(prefers-color-scheme: dark)').matches
						? mapkit.Map.ColorSchemes.Dark
						: mapkit.Map.ColorSchemes.Light
				});

				const color = getComputedStyle(document.documentElement)
					.getPropertyValue('--color-primary')
					.trim();
				const maxCount = locations.reduce((max, l) => Math.max(max, l.count), 1);
				const annotations = locations.map((loc) => {
					const size = diameterFor(loc.count, maxCount);
					const uri = circleDataUri(size, color);
					return new mapkit.ImageAnnotation(new mapkit.Coordinate(loc.latitude, loc.longitude), {
						url: { 1: uri, 2: uri, 3: uri },
						size: { width: size, height: size },
						// MapKit's own callout only appears on click/tap - suppress it
						// in favor of a plain hover tooltip (set below), which is one
						// less interaction for a simple bubble count.
						callout: { calloutShouldAppearForAnnotation: () => false }
					});
				});

				if (annotations.length > 0) {
					// Frame the camera to fit every marker - annotations must already be
					// on the map before showItems can measure them.
					map.addAnnotations(annotations);
					annotations.forEach((a, i) => {
						if (a.element) a.element.title = tooltipLabel(locations[i].count);
					});
					map.showItems(annotations, {
						animate: false,
						padding: new mapkit.Padding(24, 24, 24, 24)
					});
				}

				if (!cancelled) status = 'ready';
			} catch (err) {
				console.error('Location map failed to load:', err);
				if (!cancelled) status = 'error';
			}
		})();

		return () => {
			cancelled = true;
		};
	});
</script>

<div class="relative h-full w-full overflow-hidden rounded-xl border">
	<div bind:this={mapElement} class="bg-muted absolute inset-0"></div>

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
			<p class="text-muted-foreground text-sm">Map could not load.</p>
		</div>
	{/if}
</div>
