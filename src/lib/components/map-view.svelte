<script lang="ts">
	import { onMount } from 'svelte';
	import type { Place } from '$lib/server/db/schema';
	import { categoryGlyphDataUri } from '$lib/map-glyphs';
	import PlacePopup from './place-popup.svelte';
	import PoiPopup, { type Poi } from './poi-popup.svelte';
	import MapSearch from './map-search.svelte';
	import CategoryFilter from './category-filter.svelte';
	import { mapAppleCategory } from '$lib/map-category';
	import { Bookmark, Eye, Sparkles, ThumbsDown, ThumbsUp } from '@lucide/svelte';
	import { RELATION_COLOR, RELATION_NEUTRAL, RELATION_RECOMMENDED } from '$lib/relation-colors';
	import { theme } from '$lib/theme.svelte';
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
		frameAllPlaces = false
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
		/** Fit the camera to all pins once loaded (used when there's no better
		 *  center, e.g. a shared map viewed by someone with no known location). */
		frameAllPlaces?: boolean;
	} = $props();

	let mapElement: HTMLDivElement;
	let status = $state<'loading' | 'ready' | 'error'>('loading');
	let errorMessage = $state<string | null>(null);
	let selectedPlace = $state<Place | null>(null);
	// A tapped Apple POI that isn't one of our saved places yet (rate to save it).
	let selectedPoi = $state<Poi | null>(null);
	// Current map focus (region center), kept in sync as the user pans/zooms so
	// search can bias + sort results by proximity to what's on screen. Seeded
	// from the initial center; a region-change listener keeps it current.
	// svelte-ignore state_referenced_locally
	let focus = $state<{ latitude: number; longitude: number }>({
		latitude: center.latitude,
		longitude: center.longitude
	});

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
		{ key: 'recommended', label: 'Recommended', color: RELATION_RECOMMENDED, icon: Sparkles },
		{ key: 'liked', label: 'Liked', color: RELATION_COLOR.liked, icon: ThumbsUp },
		{ key: 'wantToGo', label: 'Want to go', color: RELATION_COLOR.want_to_go, icon: Bookmark },
		{ key: 'seen', label: 'Been there', color: RELATION_COLOR.seen, icon: Eye },
		{ key: 'disliked', label: 'Disliked', color: RELATION_COLOR.disliked, icon: ThumbsDown }
	];

	// Sourced from the shared relation palette (relation-colors.ts) so map pins,
	// the legend chips above, and the Tune rate buttons all stay in sync.
	const REL_COLOR: Record<Relation, string> = {
		liked: RELATION_COLOR.liked,
		wantToGo: RELATION_COLOR.want_to_go,
		disliked: RELATION_COLOR.disliked,
		seen: RELATION_COLOR.seen,
		recommended: RELATION_RECOMMENDED,
		other: RELATION_NEUTRAL
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

	// Level of detail: far out we draw simplified pins (no category glyph, no
	// name label) so hundreds of markers stay cheap to lay out and the map reads
	// clean; zoomed in we show the full glyph + adaptive label. Gauged by the
	// camera distance in meters (smaller = closer), kept current via
	// region-change-end.
	// Switch to full-detail pins once closer than this (~city/neighborhood).
	const DETAIL_CAMERA_DISTANCE = 40_000;
	// A location-centered map opens framed on this span around the center. Chosen
	// so the resulting camera distance lands just inside the detail band (~28km,
	// under DETAIL_CAMERA_DISTANCE), so full pins (glyph + label) show from the
	// first paint instead of far-zoom dots - i.e. the opening zoom and the detail
	// threshold coincide. We open via a region (not center + cameraDistance):
	// MapKit reliably honors a constructor region, but a constructor cameraDistance
	// can get dropped during the initial settle. (When fitting all pins the framing
	// code computes its own region and this span is ignored.)
	const OPEN_REGION_SPAN = 0.15;
	// Seed the detail state to a detailed value so pins build in full before the
	// first region-change-end reports the real distance.
	let cameraDistance = $state(30_000);
	const detailed = $derived(cameraDistance < DETAIL_CAMERA_DISTANCE);

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
	// The detail band the current annotations were built for. When `detailed`
	// flips we swap every pin between its two forms (full marker <-> dot), which
	// means recreating them, so we track what's on the map to know when to.
	let renderedDetailed: boolean | null = null;
	// Fit-to-all-pins runs once, after the first pins are on the map.
	let framedAll = false;

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

	/** A far-zoom pin: just a colored dot with a white outline (an SVG data URI).
	 *  Vector, so a single scale stays crisp on retina - passing it as the 2x/3x
	 *  entry too would make MapKit render it at half size. */
	function dotDataUri(color: string): string {
		const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18"><circle cx="9" cy="9" r="6" fill="${color}" stroke="white" stroke-width="2.5"/></svg>`;
		return 'data:image/svg+xml,' + encodeURIComponent(svg);
	}

	/**
	 * Two levels of detail, as distinct MapKit annotation types (a MarkerAnnotation
	 * is always a teardrop, so "far" can't just be a stripped-down marker):
	 *  - close: MarkerAnnotation with the category glyph + adaptive name label
	 *  - far:   ImageAnnotation of a colored dot, no label
	 * Both carry the same select behaviour and `data`/`__curioPin` tagging.
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	function makePin(p: Place, color: string, isDetailed: boolean): any {
		const coord = new window.mapkit.Coordinate(p.latitude, p.longitude);
		let ann;
		if (isDetailed) {
			const glyph = categoryGlyphDataUri(p.category);
			ann = new window.mapkit.MarkerAnnotation(coord, {
				color,
				glyphImage: { 1: glyph, 2: glyph, 3: glyph },
				// Show the place name; MapKit hides it adaptively when crowded.
				title: p.name,
				titleVisibility: window.mapkit.FeatureVisibility.Adaptive,
				subtitleVisibility: window.mapkit.FeatureVisibility.Hidden,
				callout: { calloutShouldAppearForAnnotation: () => false }
			});
		} else {
			const uri = dotDataUri(color);
			ann = new window.mapkit.ImageAnnotation(coord, {
				url: { 1: uri },
				callout: { calloutShouldAppearForAnnotation: () => false }
			});
		}
		ann.data = p;
		ann.__curioPin = true; // mark as ours so the POI select handler skips it
		ann.__curioColor = color;
		ann.addEventListener('select', () => {
			selectedPoi = null;
			selectedPlace = p;
		});
		ann.addEventListener('deselect', () => {
			setTimeout(() => {
				if (selectedPlace?.id === p.id) selectedPlace = null;
			}, 100);
		});
		return ann;
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
		previewMarker.__curioPin = true; // ours - the POI select handler skips it
		mapRef.addAnnotation(previewMarker);
	}

	function clearPreviewMarker() {
		if (mapRef && previewMarker) {
			mapRef.removeAnnotation(previewMarker);
			previewMarker = null;
		}
	}

	/**
	 * Picking a search result behaves exactly like tapping the place: fly there
	 * and open the right-side panel. If we already have the place saved (matched
	 * by Apple muid), open the full PlacePopup and highlight its pin; otherwise
	 * drop the amber preview marker and open PoiPopup to rate-and-save it.
	 */
	function selectSearchHit(hit: {
		muid: string;
		name: string;
		address: string;
		latitude: number;
		longitude: number;
		category: 'eat' | 'drink' | 'shop' | 'visit' | null;
		locality?: string;
	}) {
		if (!mapRef || !window.mapkit) return;
		const saved = places.find((p) => p.source === 'apple' && p.externalId === hit.muid);
		if (saved) {
			clearPreviewMarker();
			selectedPoi = null;
			selectedPlace = saved;
			if (saved.latitude !== null && saved.longitude !== null) {
				const coord = new window.mapkit.Coordinate(saved.latitude, saved.longitude);
				mapRef.setRegionAnimated(
					new window.mapkit.CoordinateRegion(coord, new window.mapkit.CoordinateSpan(0.01, 0.01)),
					true
				);
			}
			const ann = placeAnnotations.get(saved.id);
			if (ann) mapRef.selectedAnnotation = ann;
			return;
		}
		selectedPlace = null;
		selectedPoi = {
			muid: hit.muid,
			name: hit.name,
			category: hit.category,
			city: hit.locality ?? '',
			address: hit.address,
			latitude: hit.latitude,
			longitude: hit.longitude
		};
		previewSelected(hit);
	}

	/**
	 * Fires when any feature is selected. Our own pins carry `.data` and are
	 * handled by their per-annotation listener, so here we only handle Apple's
	 * native POIs: resolve the tapped feature to a mapkit.Place and open the
	 * rating popup. Rating it saves the place (deduped by muid, like search).
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	async function handleFeatureSelect(event: any) {
		const ann = event?.annotation;
		// Skip our own annotations (pins + search preview), which we tag with
		// `__curioPin`. We can't rely on class or `.data`: PlaceAnnotation extends
		// MarkerAnnotation, and place annotations default `.data` to a truthy `{}`.
		if (!ann || ann.__curioPin) return;

		// The selected POI exposes a mapkit.Place directly or via a lookup by id.
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		let place: any = ann.place ?? null;
		if (!place && ann.id && window.mapkit.PlaceLookup) {
			try {
				const lookup = new window.mapkit.PlaceLookup();
				place = await new Promise((resolve) => {
					lookup.getPlace(ann.id, (err: unknown, data: unknown) => resolve(err ? null : data));
				});
			} catch {
				place = null;
			}
		}
		if (!place || !place.coordinate) return;

		selectedPlace = null;
		selectedPoi = {
			muid: String(place.muid ?? place.id),
			name: place.name ?? 'Place',
			category: mapAppleCategory(place.pointOfInterestCategory),
			city: place.locality ?? place.subLocality ?? '',
			address: place.formattedAddress ?? '',
			latitude: place.coordinate.latitude,
			longitude: place.coordinate.longitude
		};
	}

	function closePoi() {
		selectedPoi = null;
		// Deselect the native feature so tapping it again re-opens the popup.
		if (mapRef) mapRef.selectedAnnotation = null;
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

				// When asked to frame the whole collection, start the map at that
				// region so nothing competes with it. Otherwise center on the given
				// point at the detail-band opening distance. (`framedAll` marks the
				// one-time framing as done.)
				const fitRegion = frameAllPlaces ? computeFitAllRegion() : null;
				if (fitRegion) framedAll = true;

				mapRef = new window.mapkit.Map(mapElement, {
					region:
						fitRegion ??
						new window.mapkit.CoordinateRegion(
							new window.mapkit.Coordinate(center.latitude, center.longitude),
							new window.mapkit.CoordinateSpan(OPEN_REGION_SPAN, OPEN_REGION_SPAN)
						),
					showsCompass: window.mapkit.FeatureVisibility.Hidden,
					showsZoomControl: false,
					showsMapTypeControl: false,
					// We show Apple's native POIs for street-level context alongside
					// our own curated pins. A place you've rated therefore appears
					// twice (our colored pin over Apple's POI); MapKit has no way to
					// hide a single native POI, so this overlap is a known tradeoff
					// to revisit (e.g. a unified pin layer we fully own).
					// Follow the site theme (light/dark/system resolved), not the raw
					// OS media query, so a manual theme choice reaches the map. Kept
					// in sync live by the $effect below.
					colorScheme:
						theme.current === 'dark'
							? window.mapkit.Map.ColorSchemes.Dark
							: window.mapkit.Map.ColorSchemes.Light
				});

				// Make Apple's native POIs tappable so any place on the map can be
				// rated, not just our own pins. handleFeatureSelect turns a tapped
				// POI into a rating popup.
				mapRef.selectableMapFeatures = [window.mapkit.MapFeatureType.PointOfInterest];
				mapRef.addEventListener('select', handleFeatureSelect);

				// Keep `focus` on the map's current center so search follows the view.
				mapRef.addEventListener('region-change-end', () => {
					const c = mapRef.center;
					if (c) focus = { latitude: c.latitude, longitude: c.longitude };
					// Drives the level-of-detail switch (simple pins far out, full
					// glyph + label zoomed in).
					if (typeof mapRef.cameraDistance === 'number') cameraDistance = mapRef.cameraDistance;
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
	// Keep the map's day/night scheme matched to the site theme as it changes
	// live (the settings toggle, or the OS flipping while on 'system').
	$effect(() => {
		const resolved = theme.current;
		if (status !== 'ready' || !mapRef || !window.mapkit) return;
		mapRef.colorScheme =
			resolved === 'dark'
				? window.mapkit.Map.ColorSchemes.Dark
				: window.mapkit.Map.ColorSchemes.Light;
	});

	$effect(() => {
		if (status !== 'ready' || !mapRef || !window.mapkit) return;

		// Reads `detailed` (reactive): crossing the zoom threshold flips every pin
		// between marker and dot. They're different annotation types, so we tear
		// the whole set down and let the diff below rebuild it in the new form.
		const wantDetailed = detailed;
		if (renderedDetailed !== wantDetailed) {
			if (placeAnnotations.size > 0) mapRef.removeAnnotations([...placeAnnotations.values()]);
			placeAnnotations.clear();
			renderedDetailed = wantDetailed;
		}

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
			if (existing && existing.__curioColor !== desiredColor) {
				// Recolor. A marker recolors in place; a dot's colour is baked into
				// its image, so drop it and let it be recreated below.
				if (wantDetailed) {
					existing.color = desiredColor;
					existing.__curioColor = desiredColor;
				} else {
					mapRef.removeAnnotation(existing);
					placeAnnotations.delete(p.id);
				}
			}
			if (placeAnnotations.has(p.id)) continue;

			const ann = makePin(p, desiredColor, wantDetailed);
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

	/**
	 * Compute a CoordinateRegion that frames every pin, for a shared map that
	 * should show the whole collection (even a globe-spanning one) rather than
	 * guessing a "home" region. Returns null if there's nothing to frame.
	 *
	 * We feed this to the Map constructor so the map STARTS at this region.
	 * Setting the region after construction races the constructor's own camera
	 * animation (to center/cameraDistance), which clobbers it; starting there
	 * avoids the race entirely.
	 */
	function computeFitAllRegion() {
		if (!window.mapkit) return null;
		const pts = places.filter((p) => p.latitude !== null && p.longitude !== null);
		if (pts.length === 0) return null;

		// Latitude is bounded (-90..90), so a plain min/max is fine.
		let minLat = 90;
		let maxLat = -90;
		for (const p of pts) {
			minLat = Math.min(minLat, p.latitude!);
			maxLat = Math.max(maxLat, p.latitude!);
		}

		// Longitude wraps at ±180, so a plain min/max frames the wrong way around
		// the globe for spread-out likes (e.g. LA + Tokyo would center on Africa).
		// Find the largest empty longitude gap; the tightest window that holds
		// every pin is its complement, centered opposite that gap.
		const lngs = pts.map((p) => p.longitude!).sort((a, b) => a - b);
		let gapStart = 0;
		let maxGap = -1;
		for (let i = 0; i < lngs.length; i++) {
			const next = i === lngs.length - 1 ? lngs[0] + 360 : lngs[i + 1];
			const gap = next - lngs[i];
			if (gap > maxGap) {
				maxGap = gap;
				gapStart = i;
			}
		}
		const lngWindow = 360 - maxGap; // width of the arc that contains all pins
		let centerLng = lngs[(gapStart + 1) % lngs.length] + lngWindow / 2;
		if (centerLng > 180) centerLng -= 360;

		// Pad so pins aren't jammed against the edges, with a floor so a single
		// city (or one pin) doesn't zoom in absurdly far, and a ceiling inside
		// MapKit's valid span range.
		const latSpan = Math.min(Math.max((maxLat - minLat) * 1.4, 0.08), 170);
		const lngSpan = Math.min(Math.max(lngWindow * 1.4, 0.08), 350);
		return new window.mapkit.CoordinateRegion(
			new window.mapkit.Coordinate((minLat + maxLat) / 2, centerLng),
			new window.mapkit.CoordinateSpan(latSpan, lngSpan)
		);
	}

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
		<MapSearch {focus} {signedIn} onSelect={selectSearchHit} onClearPreview={clearPreviewMarker} />
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
	{:else if selectedPoi}
		<PoiPopup poi={selectedPoi} {signedIn} onClose={closePoi} />
	{/if}
</div>
