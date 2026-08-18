<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
	import RelationToggle from './relation-toggle.svelte';
	import ScoreBorder from './score-border.svelte';
	import { categoryIcon, categoryLabel } from '$lib/place-category';
	import type { Place } from '$lib/server/db/schema';

	/**
	 * One place, as a card. Shared by the home recommendation rails and the
	 * profile's shared-places grids so the two can't drift.
	 *
	 * Media is the venue photo when we have one, otherwise a flat placeholder
	 * carrying the category icon.
	 *
	 * The fallback used to be a live mini map, which looked good and cost far too
	 * much: only 6 of ~2400 places have a resolved photo, so essentially every
	 * card mounted its own MapKit instance, tiles and canvas and network included,
	 * and a home screen with four rails meant roughly 32 of them at once. The Tune
	 * card still uses a real map, where there is exactly one on screen and knowing
	 * where the place sits is the point.
	 */
	let {
		place,
		photo = undefined,
		score = null
	}: {
		place: Place;
		/** Venue photo URL when we have one cached. */
		photo?: string | undefined;
		/** Recommendation score, drawn around the card's edge. Null draws nothing. */
		score?: number | null;
	} = $props();

	const CategoryIcon = $derived(categoryIcon(place.category));
</script>

<article
	class="bg-card hover:border-foreground/30 relative flex flex-col gap-3 rounded-xl border transition-colors"
>
	<ScoreBorder {score} />

	<!-- Media sits flush to the card edges, so the padding below belongs to the
	     text block rather than wrapping the image too. Both branches are the same
	     height, which is what keeps grid rows even.
	
	     Each rounds its own top corners rather than relying on the card clipping
	     them: the score pill straddles the top edge, so an `overflow-hidden` card
	     would cut the pill in half. -->
	{#if photo}
		<img
			src={photo}
			alt={place.name}
			class="h-40 w-full shrink-0 rounded-t-xl object-cover"
			loading="lazy"
			onerror={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')}
		/>
	{:else}
		<div
			class="bg-muted flex h-40 w-full shrink-0 items-center justify-center rounded-t-xl"
			aria-hidden="true"
		>
			<!-- opacity-30, not text-…/30: an alpha on the stroke colour compounds
			     where the icon's paths cross, which reads as a ghosted double image.
			     Element opacity composites the whole glyph once. -->
			<CategoryIcon class="text-muted-foreground size-10 opacity-30" />
		</div>
	{/if}

	<div class="min-w-0 px-4">
		<a href={`/places?place=${place.id}`} class="block text-sm font-medium hover:underline">
			{place.name}
		</a>
		<div class="text-muted-foreground mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
			<Badge variant="secondary" class="gap-1">
				<CategoryIcon class="size-3" />
				{categoryLabel(place.category)}
			</Badge>
			<span>{place.neighborhood ? `${place.neighborhood}, ` : ''}{place.city}</span>
		</div>
	</div>

	<div class="flex justify-end px-4 pb-4">
		<RelationToggle placeId={place.id} />
	</div>
</article>
