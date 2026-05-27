<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { Slider } from '$lib/components/ui/slider';
	import { Input } from '$lib/components/ui/input';
	import { Badge } from '$lib/components/ui/badge';
	import RelationToggle from '$lib/components/relation-toggle.svelte';
	import MatchBadge from '$lib/components/match-badge.svelte';
	import { MapPin, Search, Store } from '@lucide/svelte';

	let { data } = $props();

	type Filter = 'all' | 'liked' | 'disliked' | 'seen' | 'want_to_go' | 'recommended';
	const FILTERS: { value: Filter; label: string }[] = [
		{ value: 'all', label: 'All' },
		{ value: 'liked', label: 'Liked' },
		{ value: 'disliked', label: 'Disliked' },
		{ value: 'seen', label: 'Seen' },
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

	function setFilter(f: Filter) {
		const u = new URL(page.url);
		if (f === 'all') u.searchParams.delete('filter');
		else u.searchParams.set('filter', f);
		goto(u, { replaceState: true, keepFocus: true, noScroll: true });
	}

	const likedSet = $derived(new Set(data.likedIds));
	const dislikedSet = $derived(new Set(data.dislikedIds));
	const seenSet = $derived(new Set(data.seenIds));
	const wantToGoSet = $derived(new Set(data.wantToGoIds));

	// Filter pipeline: text + relation filter applied client-side over the
	// server's radius-filtered list. For "Recommended" we further require
	// the place to have a positive recommendation score AND no existing
	// relation (you don't need a rec for something you've already engaged with).
	const visible = $derived.by(() => {
		const q = query.trim().toLowerCase();
		let out = data.places;

		if (data.filter === 'liked') out = out.filter((p) => likedSet.has(p.id));
		else if (data.filter === 'disliked') out = out.filter((p) => dislikedSet.has(p.id));
		else if (data.filter === 'seen') out = out.filter((p) => seenSet.has(p.id));
		else if (data.filter === 'want_to_go') out = out.filter((p) => wantToGoSet.has(p.id));
		else if (data.filter === 'recommended') {
			out = out.filter(
				(p) =>
					!likedSet.has(p.id) &&
					!dislikedSet.has(p.id) &&
					!seenSet.has(p.id) &&
					!wantToGoSet.has(p.id) &&
					(data.recommendedScores[p.id] ?? 0) > 0
			);
			// Sort by recommendation score descending.
			out = [...out].sort(
				(a, b) => (data.recommendedScores[b.id] ?? 0) - (data.recommendedScores[a.id] ?? 0)
			);
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
		Everything Bond knows about within your radius. Filter, search, and react.
	</p>
</header>

{#if !data.signedIn}
	<div class="text-muted-foreground rounded-xl border border-dashed py-12 text-center text-sm">
		Sign in to filter places by your taste.
	</div>
{:else if !data.center}
	<div class="text-muted-foreground rounded-xl border border-dashed py-12 text-center text-sm">
		Set your location first — head to the dashboard and accept the location prompt.
	</div>
{:else}
	<!-- Controls -->
	<section class="bg-card mb-4 space-y-4 rounded-xl border p-4">
		<!-- Filter pills -->
		<div class="flex flex-wrap gap-1.5">
			{#each FILTERS as f (f.value)}
				<button
					type="button"
					class="rounded-full border px-3 py-1 text-xs transition-colors"
					class:bg-primary={data.filter === f.value}
					class:text-primary-foreground={data.filter === f.value}
					class:hover:bg-accent={data.filter !== f.value}
					onclick={() => setFilter(f.value)}
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
				{#if data.filter === 'recommended'}
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
		<div class="grid gap-3 sm:grid-cols-2">
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
						{#if data.filter === 'recommended' && (data.recommendedScores[p.id] ?? 0) > 0}
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
