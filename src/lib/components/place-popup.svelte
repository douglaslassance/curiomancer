<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import RelationToggle from './relation-toggle.svelte';
	import { ExternalLink, Globe, Loader2, MapPin, Navigation, ThumbsUp, X } from '@lucide/svelte';
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
	// The place's photo (the venue website's preview image), or null when there
	// is none. Resolved alongside the context; unlike the Tune card this popup
	// has no map, so it simply omits the image when absent.
	let photoUrl = $state<string | null>(null);
	// The venue's own website, from the same lookup as the photo. Null when the
	// place has none, in which case the card shows no website link.
	let website = $state<string | null>(null);

	// Re-fetch context and media whenever the placeId prop changes - switching
	// pins. The `cancelled` guard stops a slow response for a previous pin from
	// clobbering the current one.
	$effect(() => {
		const id = placeId;
		let cancelled = false;
		context = null;
		loadError = null;
		photoUrl = null;
		website = null;
		fetch(`/api/places/${id}`)
			.then(async (res) => {
				if (!res.ok) throw new Error(`Server returned ${res.status}`);
				if (cancelled) return;
				context = (await res.json()) as Context;
			})
			.catch((err) => {
				if (cancelled) return;
				console.error('Failed to load place context:', err);
				loadError = err instanceof Error ? err.message : 'Could not load.';
			});
		fetch(`/api/place-photo?placeId=${id}`)
			.then(async (res) => {
				if (cancelled || !res.ok) return;
				const media = (await res.json()) as { url: string | null; website: string | null };
				photoUrl = media.url;
				website = media.website;
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	});
</script>

<!-- Rides along in whatever row is at the top of the card, rather than floating
     over the photo where it had no space of its own. -->
{#snippet closeButton()}
	<Button
		variant="ghost"
		size="icon-sm"
		class="text-muted-foreground hover:text-foreground -mr-1 shrink-0"
		onclick={onClose}
		aria-label="Close"
	>
		<X />
	</Button>
{/snippet}

<div
	class="bg-card pointer-events-auto absolute z-10 overflow-y-auto rounded-xl border p-4 shadow-lg
		bottom-4 left-1/2 max-h-[calc(100vh-7rem)] w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2
		sm:bottom-auto sm:left-auto sm:right-4 sm:top-4 sm:max-h-[calc(100vh-6rem)] sm:w-96 sm:translate-x-0"
>
	{#if !context && !loadError}
		<div class="flex items-center gap-2 text-sm">
			<Loader2 class="text-muted-foreground size-4 animate-spin" />
			<span class="text-muted-foreground flex-1">Loading…</span>
			{@render closeButton()}
		</div>
	{:else if loadError}
		<div class="flex items-center gap-2">
			<p class="text-destructive flex-1 text-sm">{loadError}</p>
			{@render closeButton()}
		</div>
	{:else if context}
		{#if photoUrl}
			<!-- Venue photo when we have one. Omitted (no map fallback here) when
			     absent or if the image fails to load. -->
			<img
				src={photoUrl}
				alt={context.place.name}
				class="mb-3 h-40 w-full rounded-lg border object-cover"
				loading="lazy"
				onerror={() => (photoUrl = null)}
			/>
		{/if}

		<!-- Header -->
		<div>
			<div class="flex items-center gap-2">
				<h3 class="flex-1 text-sm font-semibold">{context.place.name}</h3>
				<Badge variant="secondary">{categoryLabel(context.place.category)}</Badge>
				{@render closeButton()}
			</div>
			<p class="text-muted-foreground mt-1 flex items-center gap-1 text-xs">
				<MapPin class="size-3" />
				{context.place.neighborhood
					? `${context.place.neighborhood}, ${context.place.city}`
					: context.place.city}
			</p>
		</div>

		{#if context.place.description}
			<p class="text-muted-foreground mt-2 text-xs leading-relaxed">{context.place.description}</p>
		{/if}

		<!-- Like + count -->
		<div class="mt-3 flex items-center gap-3">
			<RelationToggle placeId={context.place.id} />
			<span class="text-muted-foreground flex items-center gap-1 text-xs">
				<ThumbsUp class="size-3" />
				{context.likeCount} like{context.likeCount === 1 ? '' : 's'}
			</span>
		</div>

		<!-- Outbound actions pinned to the bottom of the card. The two things
		     you'd actually go do are buttons; Google Maps stays a quiet link. -->
		{#if googleDirectionsUrl(context.place) || googleMapsUrl(context.place) || website}
			<div class="mt-4 space-y-2 border-t pt-3">
				{#if googleDirectionsUrl(context.place) || website}
					<div class="flex items-center gap-2">
						{#if googleDirectionsUrl(context.place)}
							<Button
								href={googleDirectionsUrl(context.place)}
								target="_blank"
								rel="noopener noreferrer"
								variant="outline"
								size="sm"
								class="flex-1"
							>
								<Navigation />
								Directions
							</Button>
						{/if}
						{#if website}
							<Button
								href={website}
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
