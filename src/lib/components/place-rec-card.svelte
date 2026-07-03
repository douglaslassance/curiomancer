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
	<div class="min-w-0">
		<h3 class="text-sm font-medium">
			<a href={`/places/${place.id}`} class="hover:underline">{place.name}</a>
		</h3>
		<div class="text-muted-foreground mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
			<Badge variant="secondary" class="capitalize">{place.category}</Badge>
			<span class="flex items-center gap-1">
				<MapPin class="size-3" />
				{place.neighborhood ?? place.city}
			</span>
		</div>
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
