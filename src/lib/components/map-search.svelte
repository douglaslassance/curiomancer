<script lang="ts">
	import { Loader2, MapPin, ThumbsDown, ThumbsUp, X } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Badge } from '$lib/components/ui/badge';
	import { invalidateAll } from '$app/navigation';
	import { mapAppleCategoryClient } from '$lib/map-category';

	type Hit = {
		muid: string;
		name: string;
		address: string;
		latitude: number;
		longitude: number;
		category: 'restaurant' | 'bar' | 'shop' | null;
		locality?: string;
	};

	let {
		center,
		signedIn,
		onPreview,
		onClearPreview
	}: {
		center: { latitude: number; longitude: number };
		signedIn: boolean;
		/** Called when a search result is selected — parent flies the map. */
		onPreview: (hit: Hit) => void;
		onClearPreview: () => void;
	} = $props();

	let query = $state('');
	let results = $state<Hit[]>([]);
	let searching = $state(false);
	let selected = $state<Hit | null>(null);
	let savingKind = $state<'liked' | 'disliked' | null>(null);
	let error = $state<string | null>(null);
	let debounceId: ReturnType<typeof setTimeout> | null = null;

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let search: any = null;

	async function ensureSearch() {
		if (search) return search;
		if (typeof window === 'undefined' || !window.mapkit) {
			throw new Error('MapKit JS not loaded yet.');
		}
		search = new window.mapkit.Search({
			getsUserLocation: false,
			region: new window.mapkit.CoordinateRegion(
				new window.mapkit.Coordinate(center.latitude, center.longitude),
				new window.mapkit.CoordinateSpan(0.5, 0.5)
			)
		});
		return search;
	}

	async function runSearch(q: string) {
		if (!q.trim()) {
			results = [];
			return;
		}
		searching = true;
		error = null;
		try {
			const s = await ensureSearch();
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const data = await new Promise<any>((resolve, reject) => {
				s.search(q, (err: unknown, data: unknown) => {
					if (err) reject(err);
					else resolve(data);
				});
			});

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const places = (data?.places ?? []) as any[];
			results = places.slice(0, 8).map((p) => ({
				muid: String(p.muid ?? p.id ?? ''),
				name: p.name ?? '(unnamed)',
				address: p.formattedAddress ?? '',
				latitude: p.coordinate?.latitude ?? 0,
				longitude: p.coordinate?.longitude ?? 0,
				category: mapAppleCategoryClient(p.pointOfInterestCategory),
				locality: p.locality ?? p.subLocality ?? undefined
			}));
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

	function selectHit(hit: Hit) {
		selected = hit;
		results = [];
		query = hit.name;
		onPreview(hit);
	}

	function clearSelection() {
		selected = null;
		query = '';
		results = [];
		onClearPreview();
	}

	async function commit(kind: 'liked' | 'disliked') {
		if (!selected) return;
		if (!selected.category) {
			error = "We don't support this place's category yet (only restaurants, bars, shops).";
			return;
		}
		savingKind = kind;
		error = null;
		try {
			const res = await fetch('/api/places', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					externalId: selected.muid,
					source: 'apple',
					name: selected.name,
					category: selected.category,
					city: selected.locality ?? '',
					latitude: selected.latitude,
					longitude: selected.longitude,
					kind
				})
			});
			if (!res.ok) {
				const text = await res.text().catch(() => '');
				throw new Error(text || `Server returned ${res.status}`);
			}
			selected = null;
			query = '';
			results = [];
			onClearPreview();
			await invalidateAll();
		} catch (err) {
			console.error('Failed to add place:', err);
			error = err instanceof Error ? err.message : 'Could not add the place.';
		} finally {
			savingKind = null;
		}
	}
</script>

<div class="absolute left-4 top-4 z-20 w-[min(22rem,calc(100vw-2rem))]">
	<!-- Search input -->
	<div class="bg-card flex items-center gap-2 rounded-xl border p-2 shadow-md backdrop-blur">
		<MapPin class="text-muted-foreground ml-1 size-4 shrink-0" />
		<Input
			type="search"
			placeholder="Search places…"
			value={query}
			oninput={(e) => onInput(e.currentTarget.value)}
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

	<!-- Results dropdown -->
	{#if results.length > 0 && !selected}
		<div class="bg-card mt-1 max-h-96 overflow-y-auto rounded-xl border shadow-md backdrop-blur">
			{#each results as hit (hit.muid)}
				<button
					type="button"
					class="hover:bg-accent flex w-full items-start gap-2 px-3 py-2 text-left"
					onclick={() => selectHit(hit)}
				>
					<div class="min-w-0 flex-1">
						<div class="flex items-center gap-2">
							<span class="truncate text-sm font-medium">{hit.name}</span>
							{#if hit.category}
								<Badge variant="secondary" class="text-[10px] capitalize">{hit.category}</Badge>
							{/if}
						</div>
						<p class="text-muted-foreground mt-0.5 truncate text-xs">{hit.address}</p>
					</div>
				</button>
			{/each}
		</div>
	{/if}

	<!-- Selected preview: relation buttons -->
	{#if selected}
		<div class="bg-card mt-1 rounded-xl border p-3 shadow-md backdrop-blur">
			<div class="flex items-start justify-between gap-2">
				<div class="min-w-0 flex-1">
					<div class="flex items-center gap-2">
						<span class="truncate text-sm font-medium">{selected.name}</span>
						{#if selected.category}
							<Badge variant="secondary" class="text-[10px] capitalize">{selected.category}</Badge>
						{/if}
					</div>
					<p class="text-muted-foreground mt-0.5 truncate text-xs">{selected.address}</p>
				</div>
			</div>

			{#if !signedIn}
				<p class="text-muted-foreground mt-2 text-xs">Sign in to like or dislike places.</p>
			{:else if !selected.category}
				<p class="text-muted-foreground mt-2 text-xs">
					This category isn't supported yet — only restaurants, bars, and shops.
				</p>
			{:else}
				<div class="mt-3 flex gap-2">
					<Button
						size="sm"
						class="flex-1"
						disabled={savingKind !== null}
						onclick={() => commit('liked')}
					>
						{#if savingKind === 'liked'}
							<Loader2 class="size-4 animate-spin" />
						{:else}
							<ThumbsUp class="size-4" />
						{/if}
						Like
					</Button>
					<Button
						size="sm"
						variant="outline"
						class="flex-1"
						disabled={savingKind !== null}
						onclick={() => commit('disliked')}
					>
						{#if savingKind === 'disliked'}
							<Loader2 class="size-4 animate-spin" />
						{:else}
							<ThumbsDown class="size-4" />
						{/if}
						Dislike
					</Button>
				</div>
			{/if}

			{#if error}
				<p class="text-destructive mt-2 text-xs">{error}</p>
			{/if}
		</div>
	{/if}
</div>
