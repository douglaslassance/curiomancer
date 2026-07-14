<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
	import RelationToggle from './relation-toggle.svelte';
	import { ExternalLink, Loader2, MapPin, Navigation, ThumbsUp } from '@lucide/svelte';
	import type { Place } from '$lib/server/db/schema';
	import { googleMapsUrl, googleDirectionsUrl } from '$lib/maps-link';
	import { categoryLabel } from '$lib/place-category';

	let {
		placeId,
		onClose
	}: {
		placeId: string;
		onClose: () => void;
	} = $props();

	// The endpoint deliberately returns only the place and an aggregate like
	// count - not WHO liked it (see /api/places/[id]: named social proof made it
	// too easy to reverse-engineer someone's taste and game your match).
	type Context = {
		place: Place;
		likeCount: number;
	};

	let context = $state<Context | null>(null);
	let loadError = $state<string | null>(null);

	// Re-fetch context whenever the placeId prop changes - switching pins.
	$effect(() => {
		const id = placeId;
		context = null;
		loadError = null;
		fetch(`/api/places/${id}`)
			.then(async (res) => {
				if (!res.ok) throw new Error(`Server returned ${res.status}`);
				context = (await res.json()) as Context;
			})
			.catch((err) => {
				console.error('Failed to load place context:', err);
				loadError = err instanceof Error ? err.message : 'Could not load.';
			});
	});
</script>

<div
	class="bg-card pointer-events-auto absolute z-10 overflow-y-auto rounded-xl border p-4 shadow-lg
		bottom-4 left-1/2 max-h-[calc(100vh-7rem)] w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2
		sm:bottom-auto sm:left-auto sm:right-4 sm:top-4 sm:max-h-[calc(100vh-6rem)] sm:w-96 sm:translate-x-0"
>
	<button
		type="button"
		class="text-muted-foreground hover:text-foreground absolute right-3 top-3 text-sm"
		onclick={onClose}
		aria-label="Close"
	>
		✕
	</button>

	{#if !context && !loadError}
		<div class="flex items-center gap-2 py-2 text-sm">
			<Loader2 class="text-muted-foreground size-4 animate-spin" />
			<span class="text-muted-foreground">Loading…</span>
		</div>
	{:else if loadError}
		<p class="text-destructive py-2 text-sm">{loadError}</p>
	{:else if context}
		<!-- Header -->
		<div class="pr-6">
			<div class="flex items-start gap-2">
				<h3 class="flex-1 text-sm font-semibold">{context.place.name}</h3>
				<Badge variant="secondary">{categoryLabel(context.place.category)}</Badge>
			</div>
			<p class="text-muted-foreground mt-1 flex items-center gap-1 text-xs">
				<MapPin class="size-3" />
				{context.place.neighborhood
					? `${context.place.neighborhood}, ${context.place.city}`
					: context.place.city}
			</p>
		</div>

		<p class="text-muted-foreground mt-2 text-xs leading-relaxed">{context.place.description}</p>

		<!-- Like + count -->
		<div class="mt-3 flex items-center gap-3">
			<RelationToggle placeId={context.place.id} />
			<span class="text-muted-foreground flex items-center gap-1 text-xs">
				<ThumbsUp class="size-3" />
				{context.likeCount} like{context.likeCount === 1 ? '' : 's'}
			</span>
		</div>

		<!-- Map links pinned to the bottom of the card. -->
		{#if googleDirectionsUrl(context.place) || googleMapsUrl(context.place)}
			<div class="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 border-t pt-3">
				{#if googleDirectionsUrl(context.place)}
					<a
						href={googleDirectionsUrl(context.place)}
						target="_blank"
						rel="noopener noreferrer"
						class="text-foreground inline-flex items-center gap-1 text-xs font-medium underline"
					>
						<Navigation class="size-3" />
						Directions
					</a>
				{/if}
				{#if googleMapsUrl(context.place)}
					<a
						href={googleMapsUrl(context.place)}
						target="_blank"
						rel="noopener noreferrer"
						class="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs underline"
					>
						Open in Google Maps
						<ExternalLink class="size-3" />
					</a>
				{/if}
			</div>
		{/if}
	{/if}
</div>
