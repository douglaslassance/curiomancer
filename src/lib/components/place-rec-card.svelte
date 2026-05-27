<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
	import { MapPin } from '@lucide/svelte';
	import RelationToggle from './relation-toggle.svelte';
	import MatchBadge from './match-badge.svelte';
	import type { RecommendedPlace } from '$lib/server/matching';

	let { place, showMatch = true }: { place: RecommendedPlace; showMatch?: boolean } = $props();
</script>

<article
	class="bg-card hover:border-foreground/30 flex flex-col gap-3 rounded-xl border p-4 transition-colors"
>
	<div class="flex items-start justify-between gap-2">
		<div>
			<h3 class="text-sm font-medium">
				<a href={`/places/${place.id}`} class="hover:underline">{place.name}</a>
			</h3>
			<p class="text-muted-foreground mt-0.5 flex items-center gap-1 text-xs">
				<MapPin class="size-3" />
				{place.neighborhood ?? place.city}
			</p>
		</div>
		<Badge variant="secondary" class="capitalize">{place.category}</Badge>
	</div>
	<p class="text-muted-foreground line-clamp-2 text-xs">{place.description}</p>
	<div class="flex items-center justify-between gap-2">
		{#if showMatch && place.score > 0}
			<MatchBadge score={Math.min(place.score, 1)} />
		{:else if place.twinCount > 0}
			<span class="text-muted-foreground text-xs">
				{place.twinCount} like{place.twinCount === 1 ? '' : 's'}
			</span>
		{:else}
			<span></span>
		{/if}
		<RelationToggle placeId={place.id} />
	</div>
</article>
