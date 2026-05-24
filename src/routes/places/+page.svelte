<script lang="ts">
	import PlaceCard from '$lib/components/place-card.svelte';
	import { Separator } from '$lib/components/ui/separator';

	let { data } = $props();

	const grouped = $derived.by(() => {
		const map = new Map<string, typeof data.places>();
		for (const p of data.places) {
			if (!map.has(p.city)) map.set(p.city, []);
			map.get(p.city)!.push(p);
		}
		return [...map.entries()];
	});
</script>

<header class="mb-8">
	<h1 class="text-3xl font-semibold tracking-tight">Discover</h1>
	<p class="text-muted-foreground mt-1">
		A seed of places we like. Tap the heart on the ones that match your taste.
	</p>
</header>

<div class="space-y-10">
	{#each grouped as [city, places] (city)}
		<section>
			<div class="mb-4 flex items-baseline justify-between">
				<h2 class="text-xl font-medium">{city}</h2>
				<span class="text-muted-foreground text-sm">{places.length} places</span>
			</div>
			<Separator class="mb-4" />
			<div class="grid gap-4 md:grid-cols-2">
				{#each places as p (p.id)}
					<PlaceCard place={p} />
				{/each}
			</div>
		</section>
	{/each}
</div>
