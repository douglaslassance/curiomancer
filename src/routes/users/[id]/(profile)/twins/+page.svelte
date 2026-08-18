<script lang="ts">
	import TwinCard from '$lib/components/twin-card.svelte';

	let { data } = $props();
	const profile = $derived(data.profile);
</script>

{#if !data.viewer}
	<div class="text-muted-foreground rounded-xl border border-dashed py-8 text-center text-sm">
		<a href="/sign-in" class="underline">Sign in</a> to see the twins you and {profile.name} share.
	</div>
{:else if data.twins.length === 0}
	<p class="text-muted-foreground rounded-xl border border-dashed py-8 text-center text-sm">
		{data.viewer.isSelf ? 'No taste-twins yet.' : "You don't share any twins yet."}
	</p>
{:else}
	<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
		{#each data.twins as t (t.id)}
			<TwinCard
				id={t.id}
				name={t.name}
				image={t.image}
				score={t.score}
				sharedCount={t.sharedCount}
			/>
		{/each}
	</div>
{/if}
