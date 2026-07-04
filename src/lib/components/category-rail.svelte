<script lang="ts">
	import PlaceRecCard from './place-rec-card.svelte';
	import type { RecommendedPlace } from '$lib/server/matching';

	let {
		title,
		places,
		empty
	}: {
		title: string;
		places: RecommendedPlace[];
		empty: string;
	} = $props();
</script>

<section class="mb-10">
	<header class="mb-3 flex items-baseline justify-between">
		<h2 class="text-lg font-medium">{title}</h2>
	</header>

	{#if places.length === 0}
		<p class="text-muted-foreground rounded-xl border border-dashed py-6 text-center text-sm">
			{empty}
		</p>
	{:else}
		<div class="grid gap-3 sm:grid-cols-2">
			{#each places as place (place.id)}
				<PlaceRecCard {place} />
			{/each}
		</div>
	{/if}
</section>
