<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { Slider } from '$lib/components/ui/slider';
	import { Input } from '$lib/components/ui/input';
	import AvatarMatch from '$lib/components/avatar-match.svelte';
	import { Search, Users } from '@lucide/svelte';
	import {
		formatRadiusKm,
		positionToRadiusKm,
		radiusKmToPosition,
		RADIUS_POSITION_MAX
	} from '$lib/radius-scale';

	let { data } = $props();

	let query = $state('');

	const visible = $derived.by(() => {
		const q = query.trim().toLowerCase();
		if (!q) return data.people;
		return data.people.filter((p) => p.name.toLowerCase().includes(q));
	});

	// Radius input is bound to the URL so the page is shareable / refreshable
	// and the server load re-runs with the new value. Debounced so the
	// slider stays responsive - `localPosition` is the in-flight visual
	// (linear) slider position, mapped non-linearly to the km value that's
	// actually sent to the server; the URL holds that km value.
	// svelte-ignore state_referenced_locally
	// eslint-disable-next-line svelte/prefer-writable-derived
	let localPosition = $state(radiusKmToPosition(data.radiusKm));
	const localRadius = $derived(positionToRadiusKm(localPosition));
	let debounceId: ReturnType<typeof setTimeout> | null = null;

	// Resync if the server's view of radius changes (back nav, manual URL edit).
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
</script>

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
		<!-- Search -->
		<div class="relative">
			<Search class="text-muted-foreground absolute left-3 top-1/2 size-4 -translate-y-1/2" />
			<Input
				type="search"
				placeholder="Search people…"
				value={query}
				oninput={(e) => (query = e.currentTarget.value)}
				class="pl-9"
			/>
		</div>

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
	{#if data.people.length === 0}
		<div class="text-muted-foreground rounded-xl border border-dashed py-12 text-center text-sm">
			<Users class="mx-auto size-6 opacity-60" />
			<p class="mt-2">No taste-twins within {formatRadiusKm(data.radiusKm)}. Try widening the radius.</p>
		</div>
	{:else if visible.length === 0}
		<div class="text-muted-foreground rounded-xl border border-dashed py-12 text-center text-sm">
			<Users class="mx-auto size-6 opacity-60" />
			<p class="mt-2">No matches for "{query}".</p>
		</div>
	{:else}
		<p class="text-muted-foreground mb-3 text-xs">
			{visible.length}
			{visible.length === 1 ? 'twin' : 'twins'} within
			{formatRadiusKm(data.radiusKm)}
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
