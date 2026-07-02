<script lang="ts">
	/**
	 * Renders a 0..1 similarity score as a "92%" badge with a color that
	 * communicates strength: strong → primary, mid → muted, weak → subtle.
	 */
	/**
	 * `compact` drops the "match" label and tightens the pill - used where the
	 * context already implies it's a match score (e.g. overlapping an avatar).
	 */
	let { score, compact = false }: { score: number; compact?: boolean } = $props();

	const pct = $derived(Math.round(score * 100));
	const variant = $derived(pct >= 70 ? 'strong' : pct >= 40 ? 'mid' : 'weak');
</script>

<span
	class="inline-flex items-center rounded-full font-medium tabular-nums {compact
		? 'h-5 px-1.5 text-[11px]'
		: 'h-6 px-2 text-xs'}"
	class:bg-primary={variant === 'strong'}
	class:text-primary-foreground={variant === 'strong'}
	class:bg-secondary={variant === 'mid'}
	class:text-secondary-foreground={variant === 'mid'}
	class:bg-muted={variant === 'weak'}
	class:text-muted-foreground={variant === 'weak'}
	aria-label={`${pct} percent match`}
>
	{pct}%{compact ? '' : ' match'}
</span>
