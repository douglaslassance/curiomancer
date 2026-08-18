<script lang="ts">
	import { Tween } from 'svelte/motion';
	import { cubicOut } from 'svelte/easing';

	/**
	 * A score drawn as a progress stroke around its parent's edges. The one way
	 * a match or recommendation score is shown: it frames the card rather than
	 * ringing a portrait, which is why portraits carry no score of their own.
	 *
	 * The parent must be `relative`, and should keep its own border: this draws
	 * ON the border line, replacing it visually where the arc has reached.
	 *
	 * Dimensions come from bind:clientWidth/Height rather than percentages,
	 * because an SVG rect cannot inset itself by half a stroke width in CSS
	 * units, and stretching a viewBox instead would distort both the stroke and
	 * the corner radius on a non-square card.
	 */
	let {
		score,
		radius = 12,
		width = 3,
		showPercent = true
	}: {
		/** 0..1, clamped. Null draws nothing at all. */
		score: number | null;
		/** Corner radius in px. Match the parent's rounded-* class. */
		radius?: number;
		/** Stroke width in px. Thick enough to read as its own frame rather than
		 *  as a tinted version of the card's 1px border underneath it. */
		width?: number;
		/** Show the % badge straddling the top edge, like the avatar ring's. */
		showPercent?: boolean;
	} = $props();

	let w = $state(0);
	let h = $state(0);

	const pct = $derived(score === null ? null : Math.max(0, Math.min(100, score * 100)));

	const progress = new Tween(0, { duration: 900, easing: cubicOut });
	$effect(() => {
		progress.target = pct ?? 0;
	});

	// pathLength normalizes the perimeter to 100 units, so the dash maths is the
	// percentage directly and never has to measure the real path length.
	const dashoffset = $derived(100 - progress.current);
	const displayPct = $derived(Math.round(progress.current));
</script>

<div bind:clientWidth={w} bind:clientHeight={h} class="pointer-events-none absolute inset-0">
	{#if pct !== null && w > 0 && h > 0}
		<svg {...{ width: w, height: h }} class="absolute inset-0 overflow-visible" aria-hidden="true">
			<!-- Track first. It is deliberately stronger than the card's own border
			     colour: drawn in `--border` it would land exactly on the existing
			     border line and read as no track at all. -->
			<rect
				x={width / 2}
				y={width / 2}
				width={Math.max(0, w - width)}
				height={Math.max(0, h - width)}
				rx={radius}
				ry={radius}
				fill="none"
				stroke="var(--muted-foreground)"
				stroke-opacity="0.25"
				stroke-width={width}
			/>
			<rect
				x={width / 2}
				y={width / 2}
				width={Math.max(0, w - width)}
				height={Math.max(0, h - width)}
				rx={radius}
				ry={radius}
				fill="none"
				stroke="var(--primary)"
				stroke-width={width}
				stroke-linecap="round"
				pathLength="100"
				stroke-dasharray="100"
				stroke-dashoffset={dashoffset}
			/>
		</svg>

		{#if showPercent}
			<!-- Straddles the top edge the way the avatar ring's badge straddles the
			     ring, so the number sits on the track rather than beside it. -->
			<!-- Centred ON the stroke, not on the box edge. The rect is inset by half
			     the stroke width, so the line's centre is at `width / 2`; pinning the
			     pill to the edge instead left it sitting high by that much plus the
			     old fixed offset. -->
			<span
				style="top:{width / 2}px"
				class="text-primary-foreground bg-primary ring-background absolute right-4 -translate-y-1/2 rounded-full px-1.5 py-0.5 text-[10px] leading-none font-semibold tabular-nums ring-2"
			>
				{displayPct}%
			</span>
		{/if}
	{/if}
</div>
