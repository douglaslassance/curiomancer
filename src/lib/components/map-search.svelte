<script lang="ts">
	import { Loader2, MapPin, X } from '@lucide/svelte';
	import { Input } from '$lib/components/ui/input';
	import { mapAppleCategory } from '$lib/map-category';

	type Hit = {
		muid: string;
		name: string;
		address: string;
		latitude: number;
		longitude: number;
		category: 'eat' | 'drink' | 'shop' | 'visit' | null;
		locality?: string;
	};

	// One typeahead suggestion. Comes from MapKit's autocomplete, which returns a
	// name + address and a coordinate but no point-of-interest category (that only
	// arrives when the pick is resolved), so a Suggestion can't be rated as-is.
	type Suggestion = {
		id: string;
		muid: string;
		name: string;
		address: string;
		latitude: number;
		longitude: number;
		locality?: string;
	};

	let {
		focus,
		onSelect,
		onClearPreview
	}: {
		/** Current map focus (region center). Suggestions are biased and sorted
		 * around this, and it follows the map as the user pans/zooms. */
		focus: { latitude: number; longitude: number };
		/** A result was picked. We resolve it to a full place (for its category),
		 * then hand it up so the parent flies the map and opens the place panel,
		 * exactly as if the place's pin had been tapped. */
		onSelect: (hit: Hit) => void;
		onClearPreview: () => void;
	} = $props();

	let query = $state('');
	let results = $state<Suggestion[]>([]);
	let searching = $state(false);
	// Id of the suggestion currently being resolved, so we can spin its row.
	let resolving = $state<string | null>(null);
	let error = $state<string | null>(null);
	let debounceId: ReturnType<typeof setTimeout> | null = null;

	function makeSearch() {
		if (typeof window === 'undefined' || !window.mapkit) {
			throw new Error('MapKit JS not loaded yet.');
		}
		// Rebuilt per search (not cached) so the region tracks the current focus
		// as the user moves the map.
		return new window.mapkit.Search({
			getsUserLocation: false,
			// Restrict to points of interest. With queries/addresses on (the
			// default), a term that also names a locality wins globally over local
			// businesses, so searching "monaco" while framed on Paris returned only
			// the Principality of Monaco (690km away) and hid the "Le Monaco" bistro.
			// We only ever rate POIs anyway (eat/drink/shop/visit), so this is a
			// clean fit and keeps the region bias meaningful.
			includePointsOfInterest: true,
			includeAddresses: false,
			includeQueries: false,
			region: new window.mapkit.CoordinateRegion(
				new window.mapkit.Coordinate(focus.latitude, focus.longitude),
				new window.mapkit.CoordinateSpan(0.5, 0.5)
			)
		});
	}

	// Live typeahead: MapKit's autocomplete returns suggestions incrementally as
	// you type, like Apple Maps. Cheaper than a full search, so we debounce shorter.
	async function runAutocomplete(q: string) {
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
				s.autocomplete(q, (err: unknown, data: unknown) => {
					if (err) reject(err);
					else resolve(data);
				});
			});

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const raw = (data?.results ?? []) as any[];
			results = raw
				.map((r) => ({
					id: String(r.id ?? r.muid ?? ''),
					muid: String(r.muid ?? r.id ?? ''),
					name: r.displayLines?.[0] ?? r.name ?? '(unnamed)',
					address: r.displayLines?.[1] ?? r.formattedAddress ?? '',
					latitude: r.coordinate?.latitude ?? 0,
					longitude: r.coordinate?.longitude ?? 0,
					locality: r.locality ?? r.subLocality ?? undefined
				}))
				// Keep only suggestions we can place on the map.
				.filter((sug) => sug.id && sug.latitude !== 0)
				// Keep Apple's own relevance order (region-biased, best-first), the
				// same order iOS shows and Apple Maps shows, so Enter opens the same
				// top recommendation on both clients. Just cap the list.
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
		debounceId = setTimeout(() => runAutocomplete(value), 200);
	}

	// Enter opens the first (nearest) suggestion. If a search is still pending,
	// flush it so a fast typist who hits Enter immediately still gets results.
	function onKeydown(e: KeyboardEvent) {
		if (e.key !== 'Enter') return;
		e.preventDefault();
		if (debounceId) {
			clearTimeout(debounceId);
			debounceId = null;
		}
		if (results.length > 0) selectHit(results[0]);
		else runAutocomplete(query);
	}

	// Resolve a picked suggestion to a full place (autocomplete omits the POI
	// category), then behave like tapping its pin: the parent flies there and opens
	// the place panel, where the place is rated. We keep the query and result list
	// intact so the field stays usable for the next search.
	async function selectHit(sug: Suggestion) {
		if (resolving) return;
		resolving = sug.id;
		error = null;
		try {
			// PlaceLookup takes a plain id (no proxied object), and mirrors how a
			// tapped native POI is resolved in map-view.
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const place = window.mapkit?.PlaceLookup
				? // eslint-disable-next-line @typescript-eslint/no-explicit-any
					await new Promise<any>((resolve) => {
						const lookup = new window.mapkit.PlaceLookup();
						lookup.getPlace(sug.id, (err: unknown, data: unknown) => resolve(err ? null : data));
					})
				: null;

			const hit: Hit = place
				? {
						muid: String(place.muid ?? sug.muid),
						name: place.name ?? sug.name,
						address: place.formattedAddress ?? sug.address,
						latitude: place.coordinate?.latitude ?? sug.latitude,
						longitude: place.coordinate?.longitude ?? sug.longitude,
						category: mapAppleCategory(place.pointOfInterestCategory),
						locality: place.locality ?? place.subLocality ?? sug.locality
					}
				: // Lookup failed: still open the place, just without a resolved
					// category (the panel then treats it as not-yet-rateable).
					{ ...sug, category: null };
			onSelect(hit);
		} finally {
			resolving = null;
		}
	}

	function clearSelection() {
		query = '';
		results = [];
		onClearPreview();
	}

	// Split a suggestion name so the typed query reads bold within it, like Apple
	// Maps. Case-insensitive, every occurrence.
	function highlight(text: string, q: string): { text: string; match: boolean }[] {
		const needle = q.trim();
		if (!needle) return [{ text, match: false }];
		const parts: { text: string; match: boolean }[] = [];
		const lower = text.toLowerCase();
		const lowerNeedle = needle.toLowerCase();
		let i = 0;
		while (i < text.length) {
			const idx = lower.indexOf(lowerNeedle, i);
			if (idx === -1) {
				parts.push({ text: text.slice(i), match: false });
				break;
			}
			if (idx > i) parts.push({ text: text.slice(i, idx), match: false });
			parts.push({ text: text.slice(idx, idx + needle.length), match: true });
			i = idx + needle.length;
		}
		return parts;
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

	<!-- Suggestions: click one to open it on the map and rate it there. -->
	{#if results.length > 0}
		<div class="bg-card mt-1 max-h-96 overflow-y-auto rounded-xl border shadow-md backdrop-blur">
			{#each results as sug (sug.id)}
				<button
					type="button"
					class="hover:bg-accent flex w-full items-center gap-2 px-3 py-2 text-left"
					disabled={resolving !== null}
					onclick={() => selectHit(sug)}
				>
					<span class="min-w-0 flex-1">
						<span class="block truncate text-sm">
							{#each highlight(sug.name, query) as part}<span
									class={part.match ? 'font-semibold' : ''}>{part.text}</span
								>{/each}
						</span>
						{#if sug.address}
							<span class="text-muted-foreground mt-0.5 block truncate text-xs">{sug.address}</span>
						{/if}
					</span>
					{#if resolving === sug.id}
						<Loader2 class="text-muted-foreground size-4 shrink-0 animate-spin" />
					{/if}
				</button>
			{/each}
		</div>
	{/if}
</div>
