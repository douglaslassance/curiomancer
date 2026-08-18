<script lang="ts">
	/**
	 * A person's picture, as a rounded rectangle rather than a circle.
	 *
	 * The app shows a place's thumbnail as a flush rectangular block, and people
	 * are shown the same way so a card of a person and a card of a place read as
	 * the same kind of object. Falls back to initials on the muted block, the way
	 * a place with no photo falls back to its category icon.
	 *
	 * The match score is never drawn here. It frames the whole card instead (see
	 * score-border.svelte), which is why this takes no score at all.
	 */
	let {
		name,
		image = null,
		size = 40,
		radius = 'rounded-lg',
		fill = false
	}: {
		name: string;
		image?: string | null;
		/** Side length in px. Ignored when `fill` is set. */
		size?: number;
		/** Tailwind rounding class, so a flush card edge can pass rounded-l-xl. */
		radius?: string;
		/**
		 * Fill the parent instead of taking a fixed square. For portraits that run
		 * flush to a card's edge, where the card's own height decides the size.
		 */
		fill?: boolean;
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
	class="bg-muted text-muted-foreground flex shrink-0 items-center justify-center overflow-hidden {radius} {fill
		? 'h-full w-full'
		: ''}"
	style={fill ? undefined : `width:${size}px;height:${size}px`}
>
	{#if image}
		<img src={image} alt={name} class="h-full w-full object-cover" loading="lazy" />
	{:else}
		<span class="font-medium" style={fill ? undefined : `font-size:${Math.round(size * 0.36)}px`}
			>{initials}</span
		>
	{/if}
</div>
