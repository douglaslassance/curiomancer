<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
	import { MapPin } from '@lucide/svelte';
	import RelationToggle from './relation-toggle.svelte';
	import { categoryLabel } from '$lib/place-category';
	import type { RecommendedPlace } from '$lib/server/matching';

	// Deliberately doesn't show why this was recommended (match score, twin
	// count) - surfacing that made it too easy to reverse-engineer whose
	// taste drove a recommendation and game your own likes to match them.
	let { place }: { place: RecommendedPlace } = $props();
</script>

<article
	class="bg-card hover:border-foreground/30 flex flex-col gap-3 rounded-xl border p-4 transition-colors"
>
	<div class="min-w-0">
		<h3 class="text-sm font-medium">
			<a href={`/map?place=${place.id}`} class="hover:underline">{place.name}</a>
		</h3>
		<div class="text-muted-foreground mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
			<Badge variant="secondary">{categoryLabel(place.category)}</Badge>
			<span class="flex items-center gap-1">
				<MapPin class="size-3" />
				{place.neighborhood ?? place.city}
			</span>
		</div>
	</div>
	<p class="text-muted-foreground line-clamp-2 text-xs">{place.description}</p>
	<div class="flex items-center justify-end gap-2">
		<RelationToggle placeId={place.id} />
	</div>
</article>
