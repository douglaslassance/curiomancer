<script lang="ts">
	import type { MatchedPerson } from '$lib/server/matching';
	import TwinCard from './twin-card.svelte';
	import { Users } from '@lucide/svelte';

	let { people }: { people: MatchedPerson[] } = $props();
</script>

<section class="mb-10">
	<header class="mb-3 flex items-baseline justify-between">
		<h2 class="text-lg font-medium">Twins</h2>
		<span class="text-muted-foreground text-xs"
			>{people.length} match{people.length === 1 ? '' : 'es'}</span
		>
	</header>

	{#if people.length === 0}
		<div class="text-muted-foreground rounded-xl border border-dashed py-8 text-center text-sm">
			<Users class="mx-auto size-6 opacity-60" />
			<p class="mt-2">No matches yet. Like 5 places to start finding your taste-twins.</p>
		</div>
	{:else}
		<!-- A grid, not a horizontal scroller: TwinCard is a wide card (avatar left,
		     detail right), which cannot live in a 12rem rail, and matching the
		     profile's twins grid is the point of sharing the component. -->
		<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
			{#each people as person (person.id)}
				<TwinCard
					id={person.id}
					name={person.name}
					image={person.image}
					score={person.score}
					sharedCount={person.sharedCount}
				/>
			{/each}
		</div>
	{/if}
</section>
