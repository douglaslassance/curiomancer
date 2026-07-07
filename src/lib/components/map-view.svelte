<script lang="ts">
	import { onMount } from 'svelte';
	import type { Place } from '$lib/server/db/schema';
	import { categoryGlyphDataUri } from '$lib/map-glyphs';
	import PlacePopup from './place-popup.svelte';
	import MapSearch from './map-search.svelte';
	import CategoryFilter from './category-filter.svelte';
	import { Bookmark, Eye, Sparkles, ThumbsDown, ThumbsUp } from '@lucide/svelte';
	import type { Component } from 'svelte';

	let {
		places,
		center,
		likedIds = [],
		wantToGoIds = [],
		dislikedIds = [],
		seenIds = [],
		recommendedScores = {},
		signedIn = false,
		showSearch = true,
		showFilters = false,
		showCategoryFilter = showFilters,
		defaultFilters = {
			recommended: true,
			liked: true,
			wantToGo: true,
			disliked: false,
			seen: false
		},
		selectPlaceId = null,
		zoom = 12
	}: {
		places: Place[];
		center: { latitude: number; longitude: number };
		likedIds?: string[];
		wantToGoIds?: string[];
		dislikedIds?: string[];
		seenIds?: string[];
		/** placeId -> score, for places with no relation yet that a twin liked. */
		recommendedScores?: Record<string, number>;
		signedIn?: boolean;
		/** Deep-link: fly to and open this place's popup once the map is ready. */
		selectPlaceId?: string | null;
		/** Show the search overlay. Off for read-only maps (e.g. another user's map). */
		showSearch?: boolean;
		/** Show relation filter chips (recommended/liked/want-to-go/seen/disliked). */
		showFilters?: boolean;
		/** Show the place-type (eat/drink/shop/visit) toggle row. Defaults to showFilters. */
		showCategoryFilter?: boolean;
		/** Initial state of the relation filter chips, before the viewer touches them. */
		defaultFilters?: Record<'recommended' | 'liked' | 'wantToGo' | 'disliked' | 'seen', boolean>;
		zoom?: number;
	} = $props();

	let mapElement: HTMLDivElement;
	let status = $state<'loading' | 'ready' | 'error'>('loading');
	let errorMessage = $state<string | null>(null);
	let selectedPlace = $state<Place | null>(null);

	const likedSet = $derived(new Set(likedIds));
	const wantToGoSet = $derived(new Set(wantToGoIds));
	const dislikedSet = $derived(new Set(dislikedIds));
	const seenSet = $derived(new Set(seenIds));

	// A place is "recommended" when the viewer has no relation to it yet (checked
	// via relationOf's precedence below) and it has a positive recommendation score.
	function isRecommended(id: string): boolean {
		return (recommendedScores[id] ?? 0) > 0;
	}

	type Relation = 'liked' | 'wantToGo' | 'disliked' | 'seen' | 'recommended' | 'other';
	type FilterKey = Exclude<Relation, 'other'>;

	// Which relation categories are shown. Seen and disliked default off so the
	// map stays uncluttered; the filter chips let the user reveal them (unless
	// the caller passes different defaults). Neutral ("other") discovery pins
	// are always shown - they're the base layer. Only the initial value of
	// defaultFilters matters - once mounted, `filters` is independently
	// toggleable client state.
	// svelte-ignore state_referenced_locally
	let filters = $state<Record<FilterKey, boolean>>({ ...defaultFilters });

	// Place-type toggles (all on by default), shared with the places list.
	let categories = $state<Record<Place['category'], boolean>>({
		eat: true,
		drink: true,
		shop: true,
		visit: true
	});

	// Same icon + faded-when-off chip style as the places page. The icon is
	// tinted to the pin color so the chips double as the map's colour legend.
	const FILTER_CHIPS: { key: FilterKey; label: string; color: string; icon: Component }[] = [
		{ key: 'recommended', label: 'Recommended', color: '#f59e0b', icon: Sparkles },
		{ key: 'liked', label: 'Liked', color: '#ec4899', icon: ThumbsUp },
		{ key: 'wantToGo', label: 'Want to go', color: '#10b981', icon: Bookmark },
		{ key: 'seen', label: 'Been there', color: '#64748b', icon: Eye },
		{ key: 'disliked', label: 'Disliked', color: '#ef4444', icon: ThumbsDown }
	];

	const REL_COLOR: Record<Relation, string> = {
		liked: '#ec4899', // pink-500
		wantToGo: '#10b981', // emerald-500
		disliked: '#ef4444', // red-500
		seen: '#64748b', // slate-500
		recommended: '#f59e0b', // amber-500
		other: '#9ca3af' // gray-400
	};

	function relationOf(id: string): Relation {
		if (likedSet.has(id)) return 'liked';
		if (wantToGoSet.has(id)) return 'wantToGo';
		if (dislikedSet.has(id)) return 'disliked';
		if (seenSet.has(id)) return 'seen';
		if (isRecommended(id)) return 'recommended';
		return 'other';
	}

	/** Neutral pins always show; relationship pins follow their filter chip. */
	function isVisible(id: string): boolean {
		const rel = relationOf(id);
		return rel === 'other' ? true : filters[rel];
	}

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
	 * Pin color encodes the user's relationship: liked = pink, want-to-go =
	 * emerald, disliked = red, seen = slate, neutral = gray. Category is the
	 * glyph icon.
	 */
	function pinColor(placeId: string): string {
		return REL_COLOR[relationOf(placeId)];
	}

	function previewSelected(hit: {
		muid: string;
		name: string;
		latitude: number;
		longitude: number;
		category: 'eat' | 'drink' | 'shop' | 'visit' | null;
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
			color: '#facc15', // amber-400 - temporary, distinct from saved pins
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

				// Init once per page; the rate page shares this flag via ensureMapKit
				// so mapkit is never double-initialized (which throws).
				if (!window.mapkit.__ccInited) {
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
					window.mapkit.__ccInited = true;
				}

				mapRef = new window.mapkit.Map(mapElement, {
					center: new window.mapkit.Coordinate(center.latitude, center.longitude),
					cameraDistance: 50_000 / Math.pow(2, zoom - 12),
					showsCompass: window.mapkit.FeatureVisibility.Hidden,
					showsZoomControl: false,
					showsMapTypeControl: false,
					// We show Apple's native POIs for street-level context alongside
					// our own curated pins. A place you've rated therefore appears
					// twice (our colored pin over Apple's POI); MapKit has no way to
					// hide a single native POI, so this overlap is a known tradeoff
					// to revisit (e.g. a unified pin layer we fully own).
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
					/* MapKit doesn't always have destroy() - best effort. */
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
			// Reads `filters` + `categories` (reactive), so toggling any chip
			// re-runs this effect and adds/removes the affected pins.
			if (!isVisible(p.id) || !categories[p.category]) continue;
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
				color: desiredColor,
				glyphImage: { 1: glyph, 2: glyph, 3: glyph },
				// Show the place name as a label; MapKit reveals it when zoomed in
				// enough and hides it when far out or crowded, so you can read pins
				// without clicking. Detail still lives in PlacePopup on select, so
				// we suppress MapKit's own callout to avoid a redundant bubble.
				title: p.name,
				titleVisibility: window.mapkit.FeatureVisibility.Adaptive,
				subtitleVisibility: window.mapkit.FeatureVisibility.Hidden,
				callout: { calloutShouldAppearForAnnotation: () => false }
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

	// Deep link: when arriving with ?place=<id>, fly to that place and open its
	// popup once the map is ready. Guarded so it only runs per distinct id.
	let flownToId: string | null = null;
	$effect(() => {
		if (status !== 'ready' || !mapRef || !window.mapkit) return;
		if (!selectPlaceId || selectPlaceId === flownToId) return;
		const p = places.find((x) => x.id === selectPlaceId);
		if (!p || p.latitude === null || p.longitude === null) return;
		flownToId = selectPlaceId;
		selectedPlace = p;
		mapRef.setRegionAnimated(
			new window.mapkit.CoordinateRegion(
				new window.mapkit.Coordinate(p.latitude, p.longitude),
				new window.mapkit.CoordinateSpan(0.02, 0.02)
			),
			true
		);
	});
</script>

<div class="relative h-full w-full">
	<div bind:this={mapElement} class="absolute inset-0 bg-muted"></div>

	{#if status === 'ready' && showSearch}
		<MapSearch
			{center}
			{signedIn}
			onPreview={previewSelected}
			onClearPreview={clearPreviewMarker}
		/>
	{/if}

	{#if status === 'ready' && (showFilters || showCategoryFilter)}
		<!-- Filters: place-type toggles on top, relation toggles below. Raised so
		     they clear Apple's map attribution/logo at the bottom edge. -->
		<div class="absolute bottom-[66px] left-4 z-10 flex flex-col gap-1.5">
			{#if showCategoryFilter}
				<CategoryFilter bind:value={categories} />
			{/if}
			{#if showFilters}
				<div class="flex flex-wrap gap-1.5">
					{#each FILTER_CHIPS as chip (chip.key)}
						{@const Icon = chip.icon}
						<button
							type="button"
							onclick={() => (filters[chip.key] = !filters[chip.key])}
							aria-pressed={filters[chip.key]}
							class="bg-background/90 flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium shadow-sm backdrop-blur-sm transition-opacity {filters[
								chip.key
							]
								? ''
								: 'opacity-40'}"
						>
							<Icon class="size-3.5" style="color: {chip.color}" />
							{chip.label}
						</button>
					{/each}
				</div>
			{/if}
		</div>
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
