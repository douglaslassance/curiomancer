<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { Slider } from '$lib/components/ui/slider';
	import { Input } from '$lib/components/ui/input';
	import { Badge } from '$lib/components/ui/badge';
	import RelationToggle from '$lib/components/relation-toggle.svelte';
	import MatchBadge from '$lib/components/match-badge.svelte';
	import CategoryFilter from '$lib/components/category-filter.svelte';
	import { MapPin, Search, Store } from '@lucide/svelte';

	let { data } = $props();

	type RelFilter = 'liked' | 'disliked' | 'seen' | 'want_to_go' | 'recommended';
	const REL_FILTERS: { value: RelFilter; label: string }[] = [
		{ value: 'liked', label: 'Liked' },
		{ value: 'disliked', label: 'Disliked' },
		{ value: 'seen', label: 'Been there' },
		{ value: 'want_to_go', label: 'Want to go' },
		{ value: 'recommended', label: 'Recommended' }
	];

	// In-flight slider position; the URL holds the authoritative value.
	// svelte-ignore state_referenced_locally
	// eslint-disable-next-line svelte/prefer-writable-derived
	let localRadius = $state(data.radiusKm);
	let query = $state('');
	let debounceId: ReturnType<typeof setTimeout> | null = null;

	$effect(() => {
		localRadius = data.radiusKm;
	});

	function onRadiusChange(value: number) {
		localRadius = value;
		if (debounceId) clearTimeout(debounceId);
		debounceId = setTimeout(() => {
			const u = new URL(page.url);
			u.searchParams.set('radius', String(value));
			goto(u, { replaceState: true, keepFocus: true, noScroll: true });
		}, 250);
	}

	// Multi-toggle relation filters (empty = show everything). Seeded once from
	// the ?filter= deep-link (e.g. Settings "View liked") for backwards compat.
	// svelte-ignore state_referenced_locally
	let activeFilters = $state<Set<RelFilter>>(
		data.filter && data.filter !== 'all' ? new Set([data.filter as RelFilter]) : new Set()
	);
	function toggleFilter(f: RelFilter) {
		const next = new Set(activeFilters);
		if (next.has(f)) next.delete(f);
		else next.add(f);
		activeFilters = next;
	}

	// Place-type toggles (all on by default). Same control as the map's.
	let categories = $state<Record<'eat' | 'drink' | 'shop' | 'visit', boolean>>({
		eat: true,
		drink: true,
		shop: true,
		visit: true
	});

	const likedSet = $derived(new Set(data.likedIds));
	const dislikedSet = $derived(new Set(data.dislikedIds));
	const seenSet = $derived(new Set(data.seenIds));
	const wantToGoSet = $derived(new Set(data.wantToGoIds));

	// A place is "recommended" when the viewer has no relation to it yet and it
	// has a positive recommendation score.
	const isRecommended = (id: string) =>
		!likedSet.has(id) &&
		!dislikedSet.has(id) &&
		!seenSet.has(id) &&
		!wantToGoSet.has(id) &&
		(data.recommendedScores[id] ?? 0) > 0;

	// Filter pipeline: category + relation toggles + text, over the server's
	// radius-filtered list. Relation toggles are OR'd (a place matches if it's
	// in ANY selected relation); no toggles means show everything.
	const visible = $derived.by(() => {
		const q = query.trim().toLowerCase();
		let out = data.places.filter((p) => categories[p.category]);

		if (activeFilters.size > 0) {
			out = out.filter(
				(p) =>
					(activeFilters.has('liked') && likedSet.has(p.id)) ||
					(activeFilters.has('disliked') && dislikedSet.has(p.id)) ||
					(activeFilters.has('seen') && seenSet.has(p.id)) ||
					(activeFilters.has('want_to_go') && wantToGoSet.has(p.id)) ||
					(activeFilters.has('recommended') && isRecommended(p.id))
			);
			if (activeFilters.has('recommended')) {
				// Surface the strongest recommendations first.
				out = [...out].sort(
					(a, b) => (data.recommendedScores[b.id] ?? 0) - (data.recommendedScores[a.id] ?? 0)
				);
			}
		}

		if (q) {
			out = out.filter(
				(p) =>
					p.name.toLowerCase().includes(q) ||
					p.city.toLowerCase().includes(q) ||
					(p.neighborhood?.toLowerCase().includes(q) ?? false)
			);
		}

		return out;
	});
</script>

<header class="mb-6">
	<h1 class="text-3xl font-semibold tracking-tight">Places</h1>
	<p class="text-muted-foreground mt-1 text-sm">
		Everything Curiomancer knows about within your radius. Filter, search, and react.
	</p>
</header>

{#if !data.signedIn}
	<div class="text-muted-foreground rounded-xl border border-dashed py-12 text-center text-sm">
		Sign in to filter places by your taste.
	</div>
{:else if !data.center}
	<div class="text-muted-foreground rounded-xl border border-dashed py-12 text-center text-sm">
		Set your location first - head to the dashboard and accept the location prompt.
	</div>
{:else}
	<!-- Controls -->
	<section class="bg-card mb-4 space-y-4 rounded-xl border p-4">
		<!-- Place-type toggles -->
		<CategoryFilter bind:value={categories} />

		<!-- Relation filter toggles (multi-select; none = show all) -->
		<div class="flex flex-wrap gap-1.5">
			{#each REL_FILTERS as f (f.value)}
				<button
					type="button"
					class="rounded-full border px-3 py-1 text-xs transition-colors"
					class:bg-primary={activeFilters.has(f.value)}
					class:text-primary-foreground={activeFilters.has(f.value)}
					class:hover:bg-accent={!activeFilters.has(f.value)}
					aria-pressed={activeFilters.has(f.value)}
					onclick={() => toggleFilter(f.value)}
				>
					{f.label}
				</button>
			{/each}
		</div>

		<!-- Search -->
		<div class="relative">
			<Search class="text-muted-foreground absolute left-3 top-1/2 size-4 -translate-y-1/2" />
			<Input
				type="search"
				placeholder="Search places…"
				value={query}
				oninput={(e) => (query = e.currentTarget.value)}
				class="pl-9"
			/>
		</div>

		<!-- Radius -->
		<div>
			<div class="mb-2 flex items-baseline justify-between">
				<label for="radius" class="text-sm font-medium">Radius</label>
				<span class="text-muted-foreground tabular-nums text-sm">{localRadius} km</span>
			</div>
			<Slider
				type="single"
				id="radius"
				value={localRadius}
				onValueChange={onRadiusChange}
				min={1}
				max={500}
				step={1}
			/>
		</div>
	</section>

	<!-- Results -->
	{#if visible.length === 0}
		<div class="text-muted-foreground rounded-xl border border-dashed py-12 text-center text-sm">
			<Store class="mx-auto size-6 opacity-60" />
			<p class="mt-2">
				{#if activeFilters.has('recommended')}
					No recommendations yet. Like a few places to start getting matches.
				{:else if query}
					No matches for "{query}".
				{:else}
					Nothing here yet within {data.radiusKm} km.
				{/if}
			</p>
		</div>
	{:else}
		<p class="text-muted-foreground mb-3 text-xs">
			{visible.length} place{visible.length === 1 ? '' : 's'}
		</p>
		<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
			{#each visible as p (p.id)}
				<article
					class="bg-card hover:border-foreground/30 flex items-start justify-between gap-3 rounded-xl border p-4 transition-colors"
				>
					<a href={`/places/${p.id}`} class="min-w-0 flex-1">
						<div class="flex items-start justify-between gap-2">
							<span class="text-sm font-medium hover:underline">{p.name}</span>
							<Badge variant="secondary" class="capitalize">{p.category}</Badge>
						</div>
						<p class="text-muted-foreground mt-1 flex items-center gap-1 text-xs">
							<MapPin class="size-3" />
							{p.neighborhood ? `${p.neighborhood}, ` : ''}{p.city}
							<span>· {Math.round(p.distanceKm)} km</span>
						</p>
						{#if activeFilters.has('recommended') && (data.recommendedScores[p.id] ?? 0) > 0}
							<div class="mt-2">
								<MatchBadge score={Math.min(data.recommendedScores[p.id], 1)} />
							</div>
						{/if}
					</a>
					<div class="shrink-0">
						<RelationToggle placeId={p.id} />
					</div>
				</article>
			{/each}
		</div>
	{/if}
{/if}
