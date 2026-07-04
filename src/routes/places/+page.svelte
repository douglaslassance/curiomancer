<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { Slider } from '$lib/components/ui/slider';
	import { Input } from '$lib/components/ui/input';
	import { Badge } from '$lib/components/ui/badge';
	import RelationToggle from '$lib/components/relation-toggle.svelte';
	import CategoryFilter from '$lib/components/category-filter.svelte';
	import { categoryLabel } from '$lib/place-category';
	import {
		formatRadiusKm,
		positionToRadiusKm,
		radiusKmToPosition,
		RADIUS_POSITION_MAX
	} from '$lib/radius-scale';
	import {
		Bookmark,
		Eye,
		MapPin,
		Search,
		Sparkles,
		Store,
		ThumbsDown,
		ThumbsUp
	} from '@lucide/svelte';
	import type { Component } from 'svelte';

	let { data } = $props();

	type RelFilter = 'liked' | 'disliked' | 'seen' | 'want_to_go' | 'recommended';
	const REL_FILTERS: { value: RelFilter; label: string; icon: Component }[] = [
		{ value: 'recommended', label: 'Recommended', icon: Sparkles },
		{ value: 'liked', label: 'Liked', icon: ThumbsUp },
		{ value: 'want_to_go', label: 'Want to go', icon: Bookmark },
		{ value: 'seen', label: 'Been there', icon: Eye },
		{ value: 'disliked', label: 'Disliked', icon: ThumbsDown }
	];

	// In-flight slider position (linear); the URL holds the authoritative km
	// value, reached through the non-linear position<->km mapping below.
	// svelte-ignore state_referenced_locally
	// eslint-disable-next-line svelte/prefer-writable-derived
	let localPosition = $state(radiusKmToPosition(data.radiusKm));
	const localRadius = $derived(positionToRadiusKm(localPosition));
	let query = $state('');
	let debounceId: ReturnType<typeof setTimeout> | null = null;

	$effect(() => {
		localPosition = radiusKmToPosition(data.radiusKm);
	});

	function onRadiusChange(position: number) {
		localPosition = position;
		const km = positionToRadiusKm(position);
		if (debounceId) clearTimeout(debounceId);
		debounceId = setTimeout(() => {
			const u = new URL(page.url);
			u.searchParams.set('radius', String(km));
			goto(u, { replaceState: true, keepFocus: true, noScroll: true });
		}, 250);
	}

	// Multi-toggle relation filters. Default to the useful set - your likes plus
	// fresh recommendations - with the rest off. A ?filter= deep-link (e.g.
	// Settings "View liked") overrides the default. Turning all off shows every
	// place. Seeded once from load data.
	// svelte-ignore state_referenced_locally
	let activeFilters = $state<Set<RelFilter>>(
		data.filter && data.filter !== 'all'
			? new Set([data.filter as RelFilter])
			: new Set<RelFilter>(['liked', 'recommended'])
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

{#if !data.signedIn}
	<div class="text-muted-foreground rounded-xl border border-dashed py-12 text-center text-sm">
		Sign in to filter places by your taste.
	</div>
{:else if !data.center}
	<div class="text-muted-foreground rounded-xl border border-dashed py-12 text-center text-sm">
		Set your location first. Head to the dashboard and accept the location prompt.
	</div>
{:else}
	<!-- Controls -->
	<section class="bg-card mb-4 space-y-4 rounded-xl border p-4">
		<!-- Filters on one line: place types (left), ratings (right). -->
		<div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
			<CategoryFilter bind:value={categories} />
			<div class="flex flex-wrap gap-1.5">
				{#each REL_FILTERS as f (f.value)}
					{@const Icon = f.icon}
					<button
						type="button"
						aria-pressed={activeFilters.has(f.value)}
						onclick={() => toggleFilter(f.value)}
						class="bg-background/90 flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium shadow-sm backdrop-blur-sm transition-opacity {activeFilters.has(
							f.value
						)
							? ''
							: 'opacity-40'}"
					>
						<Icon class="size-3.5" />
						{f.label}
					</button>
				{/each}
			</div>
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
				<span class="text-muted-foreground tabular-nums text-sm">{formatRadiusKm(localRadius)}</span>
			</div>
			<Slider
				type="single"
				id="radius"
				value={localPosition}
				onValueChange={onRadiusChange}
				min={0}
				max={RADIUS_POSITION_MAX}
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
					Nothing here yet within {formatRadiusKm(data.radiusKm)}.
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
					class="bg-card hover:border-foreground/30 flex flex-col gap-3 rounded-xl border p-4 transition-colors"
				>
					<div class="min-w-0">
						<a href={`/map?place=${p.id}`} class="text-sm font-medium hover:underline">{p.name}</a>
						<div
							class="text-muted-foreground mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs"
						>
							<Badge variant="secondary">{categoryLabel(p.category)}</Badge>
							<span class="flex items-center gap-1">
								<MapPin class="size-3" />
								{p.neighborhood ? `${p.neighborhood}, ` : ''}{p.city} · {Math.round(p.distanceKm)} km
							</span>
						</div>
					</div>
					<div class="flex items-center justify-end gap-2">
						<RelationToggle placeId={p.id} />
					</div>
				</article>
			{/each}
		</div>
	{/if}
{/if}
