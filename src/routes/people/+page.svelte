<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { Slider } from '$lib/components/ui/slider';
	import AvatarMatch from '$lib/components/avatar-match.svelte';
	import { UserCheck, UserPlus, Users } from '@lucide/svelte';
	import type { Component } from 'svelte';

	let { data } = $props();

	type RelFilter = 'following' | 'followers';
	const REL_FILTERS: { value: RelFilter; label: string; icon: Component }[] = [
		{ value: 'following', label: 'Following', icon: UserCheck },
		{ value: 'followers', label: 'Followers', icon: UserPlus }
	];

	// Multi-toggle, OR'd - same idea as the Places page's relation filters.
	// No toggles means show everyone nearby.
	let activeFilters = $state<Set<RelFilter>>(new Set());
	function toggleFilter(f: RelFilter) {
		const next = new Set(activeFilters);
		if (next.has(f)) next.delete(f);
		else next.add(f);
		activeFilters = next;
	}

	const visible = $derived.by(() => {
		if (activeFilters.size === 0) return data.people;
		return data.people.filter(
			(p) =>
				(activeFilters.has('following') && p.following) ||
				(activeFilters.has('followers') && p.followedBy)
		);
	});

	// Radius input is bound to the URL so the page is shareable / refreshable
	// and the server load re-runs with the new value. Debounced so the
	// slider stays responsive - `localRadius` is the in-flight visual
	// position, and the URL is the authoritative store.
	// svelte-ignore state_referenced_locally
	// eslint-disable-next-line svelte/prefer-writable-derived
	let localRadius = $state(data.radiusKm);
	let debounceId: ReturnType<typeof setTimeout> | null = null;

	// Resync if the server's view of radius changes (back nav, manual URL edit).
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
</script>

<header class="mb-6">
	<h1 class="text-3xl font-semibold tracking-tight">Twins</h1>
	<p class="text-muted-foreground mt-1 text-sm">
		Your taste-twins near you, sorted by match. Adjust the radius to widen the net.
	</p>
</header>

{#if !data.signedIn}
	<div class="text-muted-foreground rounded-xl border border-dashed py-12 text-center text-sm">
		Sign in to see your taste-twins.
	</div>
{:else if !data.center}
	<div class="text-muted-foreground rounded-xl border border-dashed py-12 text-center text-sm">
		Set your location first. Head to the dashboard and accept the location prompt.
	</div>
{:else}
	<!-- Controls -->
	<section class="bg-card mb-6 space-y-4 rounded-xl border p-4">
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
	{#if data.people.length === 0}
		<div class="text-muted-foreground rounded-xl border border-dashed py-12 text-center text-sm">
			<Users class="mx-auto size-6 opacity-60" />
			<p class="mt-2">No taste-twins within {data.radiusKm} km. Try widening the radius.</p>
		</div>
	{:else if visible.length === 0}
		<div class="text-muted-foreground rounded-xl border border-dashed py-12 text-center text-sm">
			<Users class="mx-auto size-6 opacity-60" />
			<p class="mt-2">No twins match your filters.</p>
		</div>
	{:else}
		<p class="text-muted-foreground mb-3 text-xs">
			{visible.length}
			{visible.length === 1 ? 'twin' : 'twins'} within
			{data.radiusKm} km
		</p>
		<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
			{#each visible as person (person.id)}
				<a
					href={`/users/${person.id}`}
					class="bg-card hover:border-foreground/30 flex items-center gap-3 rounded-xl border p-4 transition-colors"
				>
					<AvatarMatch name={person.name} image={person.image} score={person.score} size={44} />
					<div class="min-w-0 flex-1">
						<div class="truncate text-sm font-medium">{person.name}</div>
						<div class="text-muted-foreground text-xs">
							{person.city} · {Math.round(person.distanceKm)} km away
						</div>
					</div>
				</a>
			{/each}
		</div>
	{/if}
{/if}
