<script lang="ts">
	import * as Avatar from '$lib/components/ui/avatar';

	/**
	 * An avatar wrapped in a circular progress ring that encodes the taste-match
	 * score. The arc length is the match %, drawn over a muted track. Replaces
	 * the standalone MatchBadge wherever a person's avatar is shown.
	 */
	let {
		name,
		score,
		image = null,
		size = 40
	}: {
		name: string;
		/** Signed similarity, -1..1, or null when there's no match signal. */
		score: number | null;
		image?: string | null;
		/** Outer diameter in px (ring included). */
		size?: number;
	} = $props();

	// No score -> no ring, just a plain avatar filling the box.
	const pct = $derived(score === null ? null : Math.max(0, Math.min(100, Math.round(score * 100))));
	const initials = $derived(
		name
			.split(/\s+/)
			.filter(Boolean)
			.slice(0, 2)
			.map((s) => s[0]?.toUpperCase() ?? '')
			.join('') || '?'
	);

	// Ring geometry. Thickness scales with size (min 2px). The stroked circle is
	// inset by half its width so it doesn't clip at the box edge.
	const stroke = $derived(Math.max(2, Math.round(size * 0.08)));
	const radius = $derived((size - stroke) / 2);
	const circ = $derived(2 * Math.PI * radius);
	const dashoffset = $derived(circ * (1 - (pct ?? 0) / 100));
	const center = $derived(size / 2);
	// Avatar sits inside the ring with a hair of breathing room; fills the box
	// when there's no ring.
	const inner = $derived(pct === null ? size : size - stroke * 2 - 2);
</script>

<div
	class="relative inline-flex shrink-0 items-center justify-center"
	style="width:{size}px;height:{size}px"
	role="img"
	aria-label={pct === null ? name : `${pct} percent taste match`}
	title={pct === null ? undefined : `${pct}% match`}
>
	{#if pct !== null}
		<svg {...{ width: size, height: size }} class="absolute inset-0 -rotate-90" aria-hidden="true">
			<circle
				cx={center}
				cy={center}
				r={radius}
				fill="none"
				stroke="var(--border)"
				stroke-width={stroke}
			/>
			<circle
				cx={center}
				cy={center}
				r={radius}
				fill="none"
				stroke="var(--primary)"
				stroke-width={stroke}
				stroke-dasharray={circ}
				stroke-dashoffset={dashoffset}
				stroke-linecap="round"
			/>
		</svg>
	{/if}
	<Avatar.Root style="width:{inner}px;height:{inner}px">
		{#if image}
			<Avatar.Image src={image} alt={name} />
		{/if}
		<Avatar.Fallback class="font-medium uppercase" style="font-size:{Math.round(inner * 0.4)}px">
			{initials}
		</Avatar.Fallback>
	</Avatar.Root>
</div>
