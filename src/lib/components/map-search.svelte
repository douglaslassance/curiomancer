<script lang="ts">
	import { Bookmark, Eye, Loader2, MapPin, ThumbsDown, ThumbsUp, X } from '@lucide/svelte';
	import { Input } from '$lib/components/ui/input';
	import { Badge } from '$lib/components/ui/badge';
	import { invalidateAll } from '$app/navigation';
	import { mapAppleCategory } from '$lib/map-category';
	import { categoryLabel } from '$lib/place-category';
	import type { Component } from 'svelte';

	type Kind = 'liked' | 'seen' | 'disliked' | 'want_to_go';
	// Same four relations as RelationToggle, in the same order, so rating a
	// search result matches rating a saved pin.
	const RATINGS: { kind: Kind; label: string; icon: Component }[] = [
		{ kind: 'liked', label: 'Like', icon: ThumbsUp },
		{ kind: 'want_to_go', label: 'Want to go', icon: Bookmark },
		{ kind: 'seen', label: 'Been there', icon: Eye },
		{ kind: 'disliked', label: 'Dislike', icon: ThumbsDown }
	];

	type Hit = {
		muid: string;
		name: string;
		address: string;
		latitude: number;
		longitude: number;
		category: 'eat' | 'drink' | 'shop' | 'visit' | null;
		locality?: string;
	};

	let {
		focus,
		signedIn,
		onSelect,
		onClearPreview
	}: {
		/** Current map focus (region center). Search is biased and sorted around
		 * this, and it follows the map as the user pans/zooms. */
		focus: { latitude: number; longitude: number };
		signedIn: boolean;
		/** A result was picked - parent flies the map and opens the place panel,
		 * exactly as if the place's pin had been tapped. */
		onSelect: (hit: Hit) => void;
		onClearPreview: () => void;
	} = $props();

	let query = $state('');
	let results = $state<Hit[]>([]);
	let searching = $state(false);
	// Which hit + kind is currently being saved, so we can spin the right button.
	let saving = $state<{ muid: string; kind: Kind } | null>(null);
	let error = $state<string | null>(null);
	let debounceId: ReturnType<typeof setTimeout> | null = null;

	/** Great-circle distance in km, for sorting results by proximity to focus. */
	function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
		const toRad = (d: number) => (d * Math.PI) / 180;
		const dLat = toRad(bLat - aLat);
		const dLng = toRad(bLng - aLng);
		const s =
			Math.sin(dLat / 2) ** 2 +
			Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
		return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(s)));
	}

	function makeSearch() {
		if (typeof window === 'undefined' || !window.mapkit) {
			throw new Error('MapKit JS not loaded yet.');
		}
		// Rebuilt per search (not cached) so the region tracks the current focus
		// as the user moves the map.
		return new window.mapkit.Search({
			getsUserLocation: false,
			region: new window.mapkit.CoordinateRegion(
				new window.mapkit.Coordinate(focus.latitude, focus.longitude),
				new window.mapkit.CoordinateSpan(0.5, 0.5)
			)
		});
	}

	async function runSearch(q: string) {
		if (!q.trim()) {
			results = [];
			return;
		}
		searching = true;
		error = null;
		try {
			const s = makeSearch();
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const data = await new Promise<any>((resolve, reject) => {
				s.search(q, (err: unknown, data: unknown) => {
					if (err) reject(err);
					else resolve(data);
				});
			});

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const places = (data?.places ?? []) as any[];
			results = places
				.map((p) => ({
					muid: String(p.muid ?? p.id ?? ''),
					name: p.name ?? '(unnamed)',
					address: p.formattedAddress ?? '',
					latitude: p.coordinate?.latitude ?? 0,
					longitude: p.coordinate?.longitude ?? 0,
					category: mapAppleCategory(p.pointOfInterestCategory),
					locality: p.locality ?? p.subLocality ?? undefined
				}))
				// Nearest to what's on screen first, then keep the top 8.
				.sort(
					(a, b) =>
						distanceKm(focus.latitude, focus.longitude, a.latitude, a.longitude) -
						distanceKm(focus.latitude, focus.longitude, b.latitude, b.longitude)
				)
				.slice(0, 8);
		} catch (err) {
			console.error('Search failed:', err);
			error = err instanceof Error ? err.message : 'Search failed.';
			results = [];
		} finally {
			searching = false;
		}
	}

	function onInput(value: string) {
		query = value;
		if (debounceId) clearTimeout(debounceId);
		debounceId = setTimeout(() => runSearch(value), 300);
	}

	// Enter validates the first (nearest) result. If a search is still pending,
	// flush it so a fast typist who hits Enter immediately still gets results.
	function onKeydown(e: KeyboardEvent) {
		if (e.key !== 'Enter') return;
		e.preventDefault();
		if (debounceId) {
			clearTimeout(debounceId);
			debounceId = null;
		}
		if (results.length > 0) selectHit(results[0]);
		else runSearch(query);
	}

	// Picking a result behaves like tapping its pin: the parent flies there and
	// opens the place panel on the right. We keep the query and result list intact
	// so the field stays usable for the next search.
	function selectHit(hit: Hit) {
		onSelect(hit);
	}

	function clearSelection() {
		query = '';
		results = [];
		onClearPreview();
	}

	// Rate a hit directly (from a result row or the preview panel) - no need to
	// "select" it first.
	async function commit(kind: Kind, hit: Hit) {
		if (!hit.category) {
			error = "We don't support this place's type yet (only places to eat, drink, shop, or visit).";
			return;
		}
		saving = { muid: hit.muid, kind };
		error = null;
		try {
			const res = await fetch('/api/places', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					externalId: hit.muid,
					source: 'apple',
					name: hit.name,
					category: hit.category,
					city: hit.locality ?? '',
					latitude: hit.latitude,
					longitude: hit.longitude,
					kind
				})
			});
			if (!res.ok) {
				const text = await res.text().catch(() => '');
				throw new Error(text || `Server returned ${res.status}`);
			}
			query = '';
			results = [];
			onClearPreview();
			await invalidateAll();
		} catch (err) {
			console.error('Failed to add place:', err);
			error = err instanceof Error ? err.message : 'Could not add the place.';
		} finally {
			saving = null;
		}
	}
</script>

<!-- Icon group mirroring RelationToggle: like / been there / dislike / want to go. -->
{#snippet ratingGroup(hit: Hit)}
	<div class="flex shrink-0 items-center gap-1">
		{#each RATINGS as r (r.kind)}
			{@const Icon = r.icon}
			<button
				type="button"
				aria-label={r.label}
				title={r.label}
				disabled={saving !== null}
				onclick={() => commit(r.kind, hit)}
				class="hover:bg-background rounded-md border p-1.5 disabled:opacity-50"
			>
				{#if saving?.muid === hit.muid && saving.kind === r.kind}
					<Loader2 class="size-4 animate-spin" />
				{:else}
					<Icon class="size-4" />
				{/if}
			</button>
		{/each}
	</div>
{/snippet}

<div class="absolute left-4 top-4 z-20 w-[min(22rem,calc(100vw-2rem))]">
	<!-- Search input -->
	<div class="bg-card flex items-center gap-2 rounded-xl border p-2 shadow-md backdrop-blur">
		<MapPin class="text-muted-foreground ml-1 size-4 shrink-0" />
		<Input
			type="search"
			placeholder="Search places…"
			value={query}
			oninput={(e) => onInput(e.currentTarget.value)}
			onkeydown={onKeydown}
			class="border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
		/>
		{#if searching}
			<Loader2 class="text-muted-foreground size-4 shrink-0 animate-spin" />
		{:else if query}
			<button
				type="button"
				class="text-muted-foreground hover:text-foreground shrink-0 rounded p-1"
				onclick={clearSelection}
				aria-label="Clear"
			>
				<X class="size-4" />
			</button>
		{/if}
	</div>

	{#if error}
		<p class="bg-card text-destructive mt-1 rounded-xl border px-3 py-2 text-xs shadow-md">
			{error}
		</p>
	{/if}

	<!-- Results dropdown: rate inline, or click the text to open it on the map. -->
	{#if results.length > 0}
		<div class="bg-card mt-1 max-h-96 overflow-y-auto rounded-xl border shadow-md backdrop-blur">
			{#each results as hit (hit.muid)}
				<div class="hover:bg-accent flex flex-col gap-2 px-3 py-2">
					<button type="button" class="min-w-0 text-left" onclick={() => selectHit(hit)}>
						<div class="flex items-center gap-2">
							<span class="truncate text-sm font-medium">{hit.name}</span>
							{#if hit.category}
								<Badge variant="secondary" class="text-[10px]">{categoryLabel(hit.category)}</Badge>
							{/if}
						</div>
						<p class="text-muted-foreground mt-0.5 truncate text-xs">{hit.address}</p>
					</button>
					{#if signedIn && hit.category}
						{@render ratingGroup(hit)}
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>
