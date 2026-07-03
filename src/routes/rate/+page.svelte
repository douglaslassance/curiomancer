<script lang="ts">
	import { onMount } from 'svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Bookmark, Eye, Loader2, MapPin, ThumbsDown, ThumbsUp } from '@lucide/svelte';
	import { relations, type Kind } from '$lib/relations.svelte';
	import { ensureMapKit } from '$lib/mapkit-client';
	import { mapAppleCategoryClient } from '$lib/map-category';
	import type { Component } from 'svelte';

	let { data } = $props();

	type Cat = 'eat' | 'drink' | 'shop' | 'visit';
	type RateItem = {
		key: string;
		name: string;
		category: Cat;
		city: string;
		neighborhood: string | null;
		description: string;
		distanceKm: number;
		// A place already in our DB (rate via /api/relations) vs a fresh Apple POI
		// (rate via /api/places, which adds it to our DB first).
		placeId: string | null;
		apple: { externalId: string; latitude: number; longitude: number } | null;
	};

	const RATINGS: { kind: Kind; label: string; icon: Component }[] = [
		{ kind: 'liked', label: 'Like', icon: ThumbsUp },
		{ kind: 'seen', label: 'Been there', icon: Eye },
		{ kind: 'disliked', label: 'Dislike', icon: ThumbsDown },
		{ kind: 'want_to_go', label: 'Want to go', icon: Bookmark }
	];

	// Seed the queue with nearby DB places the viewer hasn't rated, closest first.
	// svelte-ignore state_referenced_locally
	const ratedIds = new Set([
		...data.likedIds,
		...data.dislikedIds,
		...data.seenIds,
		...data.wantToGoIds
	]);
	// svelte-ignore state_referenced_locally
	const initialQueue: RateItem[] = data.places
		.filter((p) => !ratedIds.has(p.id))
		.sort((a, b) => a.distanceKm - b.distanceKm)
		.map((p) => ({
			key: `db:${p.id}`,
			name: p.name,
			category: p.category,
			city: p.city,
			neighborhood: p.neighborhood,
			description: p.description,
			distanceKm: p.distanceKm,
			placeId: p.id,
			apple: null
		}));

	let queue = $state<RateItem[]>(initialQueue);
	let index = $state(0);
	let doneCount = $state(0);
	let loadingMore = $state(false);
	let exhausted = $state(false);
	let mapkitError = $state(false);
	const current = $derived(queue[index] ?? null);

	// Non-reactive dedupe + sweep state. muids we've already surfaced (DB apple
	// places, plus every POI we enqueue) so Apple searches never repeat a place.
	// svelte-ignore state_referenced_locally
	const seenExternalIds = new Set<string>(data.knownExternalIds);
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let mapkit = $state<any>(null);
	let sweep: { lat: number; lng: number }[] = [];
	let sweepIndex = 0;

	function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
		const R = 6371;
		const toRad = Math.PI / 180;
		const dLat = (lat2 - lat1) * toRad;
		const dLng = (lng2 - lng1) * toRad;
		const a =
			Math.sin(dLat / 2) ** 2 +
			Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLng / 2) ** 2;
		return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
	}

	// A spiral of sub-centers covering the radius, so successive Apple searches
	// sweep the whole area (each search only returns POIs near its center) and
	// keep surfacing new places instead of the same prominent handful.
	function buildSweep(lat: number, lng: number, radiusKm: number): { lat: number; lng: number }[] {
		const out = [{ lat, lng }];
		const rings = 2;
		for (let r = 1; r <= rings; r++) {
			const ringKm = (radiusKm * r) / (rings + 1);
			const count = r * 6;
			for (let i = 0; i < count; i++) {
				const ang = (2 * Math.PI * i) / count;
				const dLat = (ringKm / 111) * Math.cos(ang);
				const dLng = (ringKm / (111 * Math.cos((lat * Math.PI) / 180))) * Math.sin(ang);
				out.push({ lat: lat + dLat, lng: lng + dLng });
			}
		}
		return out;
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	function poiSearch(lat: number, lng: number, radiusMeters: number): Promise<any[]> {
		return new Promise((resolve, reject) => {
			const s = new mapkit.PointsOfInterestSearch({
				center: new mapkit.Coordinate(lat, lng),
				radius: radiusMeters
			});
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			s.search((err: unknown, res: any) => (err ? reject(err) : resolve(res?.places ?? [])));
		});
	}

	async function fetchMore() {
		if (loadingMore || exhausted || !mapkit || !data.center) return;
		loadingMore = true;
		try {
			const searchRadius = Math.min(data.radiusKm, 5) * 1000;
			let added = 0;
			// Advance through sweep centers until one yields new places (or we run out).
			while (added === 0 && sweepIndex < sweep.length) {
				const c = sweep[sweepIndex++];
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				let results: any[] = [];
				try {
					results = await poiSearch(c.lat, c.lng, searchRadius);
				} catch (err) {
					console.error('POI search failed:', err);
					continue;
				}
				for (const p of results) {
					const cat = mapAppleCategoryClient(p.pointOfInterestCategory);
					if (!cat || !p.coordinate) continue;
					const muid = String(p.muid ?? '');
					if (!muid || seenExternalIds.has(muid)) continue;
					const dist = haversineKm(
						data.center.latitude,
						data.center.longitude,
						p.coordinate.latitude,
						p.coordinate.longitude
					);
					if (dist > data.radiusKm) continue;
					seenExternalIds.add(muid);
					queue.push({
						key: `apple:${muid}`,
						name: p.name ?? 'This place',
						category: cat,
						city: p.locality ?? data.city ?? '',
						neighborhood: p.subLocality ?? null,
						description: p.formattedAddress ?? p.name ?? '',
						distanceKm: dist,
						placeId: null,
						apple: {
							externalId: muid,
							latitude: p.coordinate.latitude,
							longitude: p.coordinate.longitude
						}
					});
					added++;
				}
			}
			if (added === 0 && sweepIndex >= sweep.length) exhausted = true;
		} finally {
			loadingMore = false;
		}
	}

	// Keep a buffer ahead of the cursor so the card never blocks on a fetch.
	function maybePrefetch() {
		if (!exhausted && queue.length - index <= 3) fetchMore();
	}

	// Safety net: if we ever run dry and aren't exhausted, pull more.
	$effect(() => {
		if (data.signedIn && data.center && mapkit && !current && !loadingMore && !exhausted) {
			fetchMore();
		}
	});

	onMount(async () => {
		if (!data.signedIn || !data.center) return;
		try {
			mapkit = await ensureMapKit();
		} catch (err) {
			console.error('MapKit failed to load:', err);
			mapkitError = true;
			return;
		}
		sweep = buildSweep(data.center.latitude, data.center.longitude, data.radiusKm);
		// Authorization is async; retry the prefetch once the token lands.
		mapkit.addEventListener?.('configuration-change', () => maybePrefetch());
		maybePrefetch();
	});

	async function rate(kind: Kind) {
		const item = current;
		if (!item) return;
		index += 1;
		doneCount += 1;
		maybePrefetch();
		try {
			let res: Response;
			if (item.placeId) {
				relations.apply(item.placeId, kind);
				res = await fetch('/api/relations', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ placeId: item.placeId, kind })
				});
			} else if (item.apple) {
				res = await fetch('/api/places', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						externalId: item.apple.externalId,
						source: 'apple',
						name: item.name,
						category: item.category,
						city: item.city,
						latitude: item.apple.latitude,
						longitude: item.apple.longitude,
						kind
					})
				});
			} else {
				return;
			}
			if (!res.ok) throw new Error(await res.text());
		} catch (err) {
			console.error('Failed to save rating:', err);
		}
	}

	function skip() {
		if (current) {
			index += 1;
			maybePrefetch();
		}
	}
</script>

<div>
	<header class="mb-6">
		<h1 class="text-3xl font-semibold tracking-tight">Rate</h1>
		<p class="text-muted-foreground mt-1 text-sm">
			Quickly react to places around you. The more you rate, the sharper your matches get.
		</p>
	</header>

	{#if !data.signedIn}
		<div class="text-muted-foreground rounded-xl border border-dashed py-12 text-center text-sm">
			Sign in to rate places near you.
		</div>
	{:else if !data.center}
		<div class="text-muted-foreground rounded-xl border border-dashed py-12 text-center text-sm">
			Set your location first. Head to the dashboard and accept the location prompt.
		</div>
	{:else if current}
		<!-- Progress -->
		<div class="mb-3 flex items-center justify-between">
			<span class="text-muted-foreground text-xs tabular-nums">
				{Math.round(current.distanceKm)} km away
			</span>
			{#if doneCount > 0}
				<span class="text-muted-foreground text-xs tabular-nums">
					{doneCount} rated this session
				</span>
			{/if}
		</div>

		<!-- Current place -->
		<article class="bg-card rounded-xl border p-6">
			<div class="flex items-start gap-2">
				<h2 class="flex-1 text-xl font-semibold tracking-tight">
					{#if current.placeId}
						<a href={`/places/${current.placeId}`} class="hover:underline">{current.name}</a>
					{:else}
						{current.name}
					{/if}
				</h2>
				<Badge variant="secondary" class="capitalize">{current.category}</Badge>
			</div>
			<p class="text-muted-foreground mt-2 flex items-center gap-1 text-sm">
				<MapPin class="size-4" />
				{current.neighborhood ? `${current.neighborhood}, ` : ''}{current.city}
			</p>
			{#if current.description}
				<p class="text-muted-foreground mt-3 text-sm leading-relaxed">{current.description}</p>
			{/if}

			<!-- Ratings: 2x2 grid, then skip. -->
			<div class="mt-6 grid grid-cols-2 gap-2">
				{#each RATINGS as r (r.kind)}
					{@const Icon = r.icon}
					<Button variant="outline" class="h-12 justify-start gap-2" onclick={() => rate(r.kind)}>
						<Icon class="size-4" />
						{r.label}
					</Button>
				{/each}
			</div>
			<Button variant="outline" class="mt-3 h-12 w-full" onclick={skip}>Skip</Button>
		</article>
	{:else if loadingMore || (!exhausted && !mapkitError)}
		<div class="text-muted-foreground rounded-xl border border-dashed py-12 text-center text-sm">
			<Loader2 class="mx-auto size-5 animate-spin" />
			<p class="mt-2">Finding more places near you…</p>
		</div>
	{:else}
		<!-- Genuinely nothing left within the radius (or maps unavailable). Low-key,
		     not a celebration, the point is to keep discovering. -->
		<div class="text-muted-foreground rounded-xl border border-dashed py-12 text-center text-sm">
			<p>
				{#if mapkitError}
					Couldn't load more places right now.
				{:else}
					That's every place within {data.radiusKm} km for now. Check back as new ones appear.
				{/if}
			</p>
			<Button href="/places" variant="outline" size="sm" class="mt-4">Browse places</Button>
		</div>
	{/if}
</div>
