<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
	import RelationToggle from './relation-toggle.svelte';
	import MatchBadge from './match-badge.svelte';
	import { ExternalLink, Loader2, MapPin, Navigation, ThumbsUp, Users } from '@lucide/svelte';
	import type { Place } from '$lib/server/db/schema';
	import type { MatchedPerson } from '$lib/server/matching';
	import { googleMapsUrl, googleDirectionsUrl } from '$lib/maps-link';
	import { page } from '$app/state';

	let {
		placeId,
		onClose
	}: {
		placeId: string;
		onClose: () => void;
	} = $props();

	type Context = {
		place: Place;
		likeCount: number;
		likers: MatchedPerson[];
	};

	let context = $state<Context | null>(null);
	let loadError = $state<string | null>(null);

	const signedIn = $derived(!!page.data.user);
	const twins = $derived(context?.likers.filter((l) => l.score > 0) ?? []);
	const others = $derived(context?.likers.filter((l) => l.score === 0) ?? []);

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
				<h3 class="flex-1 text-sm font-semibold">
					<a href={`/places/${context.place.id}`} class="hover:underline">{context.place.name}</a>
				</h3>
				<Badge variant="secondary" class="capitalize">{context.place.category}</Badge>
			</div>
			<p class="text-muted-foreground mt-1 flex items-center gap-1 text-xs">
				<MapPin class="size-3" />
				{context.place.neighborhood
					? `${context.place.neighborhood}, ${context.place.city}`
					: context.place.city}
			</p>
			<div class="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
				{#if googleDirectionsUrl(context.place)}
					<a
						href={googleDirectionsUrl(context.place)}
						target="_blank"
						rel="noopener noreferrer"
						class="text-foreground hover:text-foreground inline-flex items-center gap-1 text-xs font-medium underline"
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

		<!-- Why you're seeing this -->
		{#if signedIn && twins.length > 0}
			<div class="mt-4 border-t pt-3">
				<p class="text-foreground text-xs font-medium">Why you're seeing this</p>
				<p class="text-muted-foreground mt-0.5 text-xs">
					{twins.length}
					{twins.length === 1 ? 'person who shares' : 'people who share'} your taste.
				</p>
				<div class="mt-2 flex gap-2 overflow-x-auto pb-1">
					{#each twins as person (person.id)}
						<a
							href={`/users/${person.id}`}
							class="bg-background hover:border-foreground/30 flex w-32 shrink-0 flex-col gap-1 rounded-lg border p-2.5 transition-colors"
						>
							<div
								class="bg-muted flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-medium uppercase"
							>
								{person.name.slice(0, 1)}
							</div>
							<div class="truncate text-xs font-medium">{person.name}</div>
							<MatchBadge score={person.score} />
						</a>
					{/each}
				</div>
			</div>
		{/if}

		<!-- Other likers (non-twins or anonymous viewer) -->
		{#if others.length > 0}
			<div class="mt-3 flex flex-wrap gap-1.5">
				{#each others as person (person.id)}
					<a
						href={`/users/${person.id}`}
						class="bg-background hover:border-foreground/30 flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] transition-colors"
					>
						<div
							class="bg-muted flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-medium uppercase"
						>
							{person.name.slice(0, 1)}
						</div>
						{person.name}
					</a>
				{/each}
			</div>
		{/if}

		{#if context.likers.length === 0}
			<p class="text-muted-foreground mt-3 flex items-center gap-1 text-xs">
				<Users class="size-3" />
				Nobody has liked this yet. Be the first.
			</p>
		{/if}
	{/if}
</div>
