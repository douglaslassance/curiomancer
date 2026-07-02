<script lang="ts">
	import type { MatchedPerson } from '$lib/server/matching';
	import AvatarMatch from './avatar-match.svelte';
	import { Users } from '@lucide/svelte';

	let { people }: { people: MatchedPerson[] } = $props();
</script>

<section class="mb-10">
	<header class="mb-3 flex items-baseline justify-between">
		<h2 class="text-lg font-medium">People</h2>
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
		<div class="flex gap-3 overflow-x-auto pb-2">
			{#each people as person (person.id)}
				<a
					href={`/users/${person.id}`}
					class="bg-card hover:border-foreground/30 flex w-48 shrink-0 flex-col gap-2 rounded-xl border p-4 transition-colors"
				>
					<AvatarMatch name={person.name} image={person.image} score={person.score} size={52} />
					<div class="text-sm font-medium">{person.name}</div>
					<div class="text-muted-foreground text-xs">
						{person.sharedCount} shared like{person.sharedCount === 1 ? '' : 's'}
					</div>
				</a>
			{/each}
		</div>
	{/if}
</section>
