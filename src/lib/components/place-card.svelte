<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import { MapPin } from '@lucide/svelte';
	import RelationToggle from './relation-toggle.svelte';
	import { categoryLabel } from '$lib/place-category';
	import type { Place } from '$lib/server/db/schema';

	let { place }: { place: Place } = $props();
</script>

<Card.Root class="hover:border-foreground/30 transition-colors">
	<Card.Header>
		<div class="flex items-start justify-between gap-3">
			<div>
				<Card.Title>
					<a href={`/map?place=${place.id}`} class="hover:underline">{place.name}</a>
				</Card.Title>
				<Card.Description class="mt-1 flex items-center gap-1 text-xs">
					<MapPin class="size-3" />
					{place.neighborhood ? `${place.neighborhood}, ` : ''}{place.city}
				</Card.Description>
			</div>
			<Badge variant="secondary">{categoryLabel(place.category)}</Badge>
		</div>
	</Card.Header>
	<Card.Content>
		<p class="text-muted-foreground text-sm">{place.description}</p>
	</Card.Content>
	<Card.Footer>
		<RelationToggle placeId={place.id} />
	</Card.Footer>
</Card.Root>
