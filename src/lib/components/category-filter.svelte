<script lang="ts">
	import { ShoppingBag, Martini, UtensilsCrossed } from '@lucide/svelte';
	import type { Component } from 'svelte';

	type Cat = 'shop' | 'bar' | 'restaurant';

	// Toggle which place types are shown. Shared by the places list and the map
	// so the "type of place" filter looks and behaves identically in both.
	let {
		value = $bindable({ shop: true, bar: true, restaurant: true })
	}: {
		value?: Record<Cat, boolean>;
	} = $props();

	const CATS: { key: Cat; label: string; icon: Component }[] = [
		{ key: 'shop', label: 'Shops', icon: ShoppingBag },
		{ key: 'bar', label: 'Bars', icon: Martini },
		{ key: 'restaurant', label: 'Restaurants', icon: UtensilsCrossed }
	];
</script>

<div class="flex flex-wrap gap-1.5">
	{#each CATS as c (c.key)}
		{@const Icon = c.icon}
		<button
			type="button"
			onclick={() => (value[c.key] = !value[c.key])}
			aria-pressed={value[c.key]}
			class="bg-background/90 flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium shadow-sm backdrop-blur-sm transition-opacity {value[
				c.key
			]
				? ''
				: 'opacity-40'}"
		>
			<Icon class="size-3.5" />
			{c.label}
		</button>
	{/each}
</div>
