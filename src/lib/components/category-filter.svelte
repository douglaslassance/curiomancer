<script lang="ts">
	import { ShoppingBag, Martini, UtensilsCrossed, Landmark } from '@lucide/svelte';
	import { categoryLabel } from '$lib/place-category';
	import type { Component } from 'svelte';

	type Cat = 'eat' | 'drink' | 'shop' | 'visit';

	// Toggle which place types are shown. Shared by the places list and the map
	// so the "type of place" filter looks and behaves identically in both.
	let {
		value = $bindable({ eat: true, drink: true, shop: true, visit: true })
	}: {
		value?: Record<Cat, boolean>;
	} = $props();

	const CATS: { key: Cat; label: string; icon: Component }[] = [
		{ key: 'eat', label: categoryLabel('eat'), icon: UtensilsCrossed },
		{ key: 'drink', label: categoryLabel('drink'), icon: Martini },
		{ key: 'shop', label: categoryLabel('shop'), icon: ShoppingBag },
		{ key: 'visit', label: categoryLabel('visit'), icon: Landmark }
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
