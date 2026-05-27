<script lang="ts">
	import PlaceCard from '$lib/components/place-card.svelte';
	import { Button } from '$lib/components/ui/button';
	import { relations } from '$lib/relations.svelte';
	import { HeartCrack } from '@lucide/svelte';

	let { data } = $props();

	// Signed-in: server already filtered to liked places.
	// Anonymous: filter all places by the client's localStorage store.
	const liked = $derived(
		data.scope === 'user'
			? data.places
			: data.places.filter((p) => relations.kindOf(p.id) === 'liked')
	);
</script>

<header class="mb-8">
	<h1 class="text-3xl font-semibold tracking-tight">Your likes</h1>
	<p class="text-muted-foreground mt-1">
		{#if data.scope === 'anonymous'}
			Saved on this device. Sign up to keep them across devices.
		{:else}
			Synced to your account.
		{/if}
	</p>
</header>

{#if liked.length === 0}
	<div class="text-muted-foreground rounded-xl border border-dashed py-16 text-center">
		<HeartCrack class="mx-auto size-8 opacity-60" />
		<p class="mt-3">No likes yet.</p>
		<Button href="/places" variant="link">Go find some →</Button>
	</div>
{:else}
	<div class="grid gap-4 md:grid-cols-2">
		{#each liked as p (p.id)}
			<PlaceCard place={p} />
		{/each}
	</div>
{/if}
