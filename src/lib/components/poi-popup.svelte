<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Bookmark, Eye, Globe, Loader2, MapPin, Navigation, ThumbsDown, ThumbsUp, X } from '@lucide/svelte';
	import { categoryLabel } from '$lib/place-category';
	import type { PlaceCategory } from '$lib/map-category';
	import type { Component } from 'svelte';

	// A place tapped on the map that isn't in our DB yet. Rating it creates the
	// place (deduped by Apple muid, same as search/import) and records the
	// relation via POST /api/places.
	export type Poi = {
		muid: string;
		name: string;
		category: PlaceCategory;
		city: string;
		address: string;
		latitude: number;
		longitude: number;
		/** The venue's own site, when Apple knows one. */
		website?: string | null;
	};

	let {
		poi,
		signedIn,
		onClose
	}: {
		poi: Poi;
		signedIn: boolean;
		onClose: () => void;
	} = $props();

	type Kind = 'liked' | 'want_to_go' | 'seen' | 'disliked';
	const RATINGS: { kind: Kind; label: string; icon: Component }[] = [
		{ kind: 'liked', label: 'Like', icon: ThumbsUp },
		{ kind: 'want_to_go', label: 'Want to go', icon: Bookmark },
		{ kind: 'seen', label: 'Been there', icon: Eye },
		{ kind: 'disliked', label: 'Dislike', icon: ThumbsDown }
	];

	let saving = $state<Kind | null>(null);
	let error = $state<string | null>(null);

	async function rate(kind: Kind) {
		saving = kind;
		error = null;
		try {
			const res = await fetch('/api/places', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					externalId: poi.muid,
					source: 'apple',
					name: poi.name,
					category: poi.category,
					city: poi.city,
					latitude: poi.latitude,
					longitude: poi.longitude,
					kind
				})
			});
			if (!res.ok) throw new Error((await res.text().catch(() => '')) || `Server returned ${res.status}`);
			await invalidateAll();
			onClose();
		} catch (err) {
			console.error('Failed to rate place:', err);
			error = err instanceof Error ? err.message : 'Could not save.';
		} finally {
			saving = null;
		}
	}
</script>

<div
	class="bg-card pointer-events-auto absolute z-10 overflow-y-auto rounded-xl border p-4 shadow-lg
		bottom-4 left-1/2 max-h-[calc(100vh-7rem)] w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2
		sm:bottom-auto sm:left-auto sm:right-4 sm:top-4 sm:max-h-[calc(100vh-6rem)] sm:w-96 sm:translate-x-0"
>
	<div>
		<!-- In the header row next to the category, same as the place card. -->
		<div class="flex items-center gap-2">
			<h3 class="flex-1 text-sm font-semibold">{poi.name}</h3>
			{#if poi.category !== 'other'}
				<Badge variant="secondary">{categoryLabel(poi.category)}</Badge>
			{/if}
			<Button
				variant="ghost"
				size="icon-sm"
				class="text-muted-foreground hover:text-foreground -mr-1 shrink-0"
				onclick={onClose}
				aria-label="Close"
			>
				<X />
			</Button>
		</div>
		{#if poi.address || poi.city}
			<p class="text-muted-foreground mt-1 flex items-center gap-1 text-xs">
				<MapPin class="size-3" />
				{poi.address || poi.city}
			</p>
		{/if}
	</div>

	{#if !signedIn}
		<p class="text-muted-foreground mt-3 text-xs">Sign in to rate places.</p>
	{:else}
		<div class="mt-3 flex items-center gap-1">
			{#each RATINGS as r (r.kind)}
				{@const Icon = r.icon}
				<button
					type="button"
					aria-label={r.label}
					title={r.label}
					disabled={saving !== null}
					onclick={() => rate(r.kind)}
					class="hover:bg-background rounded-md border p-1.5 disabled:opacity-50"
				>
					{#if saving === r.kind}
						<Loader2 class="size-4 animate-spin" />
					{:else}
						<Icon class="size-4" />
					{/if}
				</button>
			{/each}
		</div>
	{/if}

	<!-- Same actions, same order, same row as the saved-place card. -->
	<div class="mt-3 flex items-center gap-2 border-t pt-3">
		<Button
			href="https://www.google.com/maps/dir/?api=1&destination={poi.latitude},{poi.longitude}"
			target="_blank"
			rel="noopener noreferrer"
			variant="outline"
			size="sm"
			class="flex-1"
		>
			<Navigation />
			Directions
		</Button>
		{#if poi.website}
			<Button
				href={poi.website}
				target="_blank"
				rel="noopener noreferrer"
				variant="outline"
				size="sm"
				class="flex-1"
			>
				<Globe />
				Website
			</Button>
		{/if}
	</div>

	{#if error}
		<p class="text-destructive mt-2 text-xs">{error}</p>
	{/if}
</div>
