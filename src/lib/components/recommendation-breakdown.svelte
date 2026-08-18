<script lang="ts">
	import { Shield, Sigma, ThumbsDown, ThumbsUp } from '@lucide/svelte';
	import type { RecommendationBreakdown } from '$lib/recommendation-breakdown';

	/**
	 * Admin-only anatomy of one place's recommendation score, shown inside the
	 * map popup. The third of the analysis panels, alongside match-breakdown
	 * (why this person) and tune-breakdown (why this card).
	 *
	 *   score = agreement * best endorser's twin score
	 *
	 * Laid out to answer "who is behind this" first, since the whole design of
	 * the ranking is that a real person always caps the number.
	 */
	let { rec }: { rec: RecommendationBreakdown } = $props();

	const pct = (v: number) => `${Math.round(v * 100)}%`;
	const likers = $derived(rec.twins.filter((t) => t.kind === 'liked'));
	const dissenters = $derived(rec.twins.filter((t) => t.kind === 'disliked'));

	/**
	 * Why the score is what it is, in a sentence. The server only sends a
	 * breakdown for places that genuinely are recommendations, so there is always
	 * a best endorser and a score by the time this renders.
	 */
	const verdict = $derived.by(() => {
		const endorser = rec.bestEndorser;
		if (!endorser || rec.score === null) return '';
		if (dissenters.length === 0)
			return `${endorser.name} is your strongest twin who likes this, and nobody disagrees, so the score is theirs in full.`;
		return `${endorser.name} backs it at ${pct(endorser.score)}, cut to ${pct(rec.score)} by ${dissenters.length} twin${dissenters.length === 1 ? '' : 's'} who disagree.`;
	});
</script>

<div class="mt-3 rounded-lg border p-3">
	<p class="text-foreground flex items-center gap-2 text-sm font-medium">
		<Shield class="text-muted-foreground size-4" />
		Analysis
	</p>
	<p class="text-muted-foreground mt-1 text-xs">{verdict}</p>

	{#if rec.twins.length > 0}
		<!-- The arithmetic, matching the panel on the Tune card. -->
		{#if rec.bestEndorser && rec.agreement !== null}
			<div
				class="text-muted-foreground bg-muted/40 mt-2 flex flex-wrap items-center gap-x-2 rounded border px-2 py-1 font-mono text-[11px]"
			>
				<Sigma class="size-3 shrink-0" />
				<span class="whitespace-nowrap">{rec.agreement.toFixed(2)} agreement</span>
				<span class="whitespace-nowrap">× {rec.bestEndorser.score.toFixed(2)} best twin</span>
				<span class="whitespace-nowrap">
					= <span class="text-foreground font-semibold"
						>{(rec.agreement * rec.bestEndorser.score).toFixed(3)}</span
					>
				</span>
			</div>
		{/if}

		<ul class="mt-2 space-y-1">
			{#each rec.twins as t (t.userId)}
				<li class="flex items-center gap-2 text-xs">
					{#if t.kind === 'liked'}
						<ThumbsUp class="text-primary size-3.5 shrink-0" />
					{:else}
						<ThumbsDown class="text-destructive size-3.5 shrink-0" />
					{/if}
					<a href={`/users/${t.userId}`} class="min-w-0 flex-1 truncate hover:underline">{t.name}</a
					>
					<span class="text-muted-foreground shrink-0 tabular-nums">{pct(t.score)}</span>
				</li>
			{/each}
		</ul>
		<p class="text-muted-foreground mt-2 text-[11px]">
			{likers.length} of your twins like this{dissenters.length > 0
				? `, ${dissenters.length} do not`
				: ''}. Only the strongest liker sets the score, so more agreement never outranks a closer
			twin.
		</p>
	{/if}
</div>
