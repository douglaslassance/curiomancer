<script lang="ts">
	/**
	 * A person's picture: a circle, with initials on a muted disc as the fallback.
	 *
	 * Round rather than the rounded rectangle a place thumbnail gets. It reads
	 * better for a face and it drops into any layout without the surrounding card
	 * having to make room for a flush edge, which is what a rectangular portrait
	 * forces on every caller.
	 *
	 * No score is drawn here. It frames the whole card instead (see
	 * score-border.svelte), which is why this takes no score at all.
	 */
	let {
		name,
		image = null,
		size = 40
	}: {
		name: string;
		image?: string | null;
		/** Diameter in px. */
		size?: number;
	} = $props();

	const initials = $derived(
		name
			.split(/\s+/)
			.filter(Boolean)
			.slice(0, 2)
			.map((s) => s[0]?.toUpperCase() ?? '')
			.join('') || '?'
	);
</script>

<div
	class="bg-muted text-muted-foreground flex shrink-0 items-center justify-center overflow-hidden rounded-full"
	style="width:{size}px;height:{size}px"
>
	{#if image}
		<img src={image} alt={name} class="h-full w-full object-cover" loading="lazy" />
	{:else}
		<span class="font-medium" style="font-size:{Math.round(size * 0.36)}px">{initials}</span>
	{/if}
</div>
