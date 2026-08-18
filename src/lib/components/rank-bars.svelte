<script lang="ts">
	/**
	 * A ranked list of counts as horizontal bars.
	 *
	 * Horizontal because the labels are place names, which collide as x-axis
	 * ticks. One series, so no legend and no tooltip: every row carries its own
	 * label and its own value.
	 *
	 * Bars scale to the largest row rather than to the total, otherwise one
	 * dominant entry flattens everything below it into unreadable slivers.
	 */
	let {
		items,
		empty = 'Nothing to show yet.',
		max: cap = null
	}: {
		items: { label: string; count: number }[];
		empty?: string;
		/** Show at most this many rows, with the remainder folded into "Other". */
		max?: number | null;
	} = $props();

	const rows = $derived.by(() => {
		if (cap === null || items.length <= cap) return items;
		// Never silently truncate: the tail is summed and labelled, so the totals
		// still add up to what the caller passed in.
		const head = items.slice(0, cap);
		const rest = items.slice(cap);
		const restCount = rest.reduce((sum, r) => sum + r.count, 0);
		return [...head, { label: `Other (${rest.length})`, count: restCount }];
	});
	const top = $derived(Math.max(1, ...rows.map((r) => r.count)));
</script>

{#if rows.length === 0}
	<p class="text-muted-foreground text-sm">{empty}</p>
{:else}
	<ul class="space-y-2">
		{#each rows as row (row.label)}
			<li class="grid grid-cols-[9rem_1fr_2.5rem] items-center gap-3 text-sm">
				<span class="truncate" title={row.label}>{row.label}</span>
				<span class="bg-muted h-2 overflow-hidden rounded-full">
					<span
						class="bg-primary block h-full rounded-full"
						style="width:{(row.count / top) * 100}%"
					></span>
				</span>
				<span class="text-muted-foreground text-right tabular-nums">{row.count}</span>
			</li>
		{/each}
	</ul>
{/if}
