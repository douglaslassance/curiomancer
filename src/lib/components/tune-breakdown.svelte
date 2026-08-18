<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import { Shield, Sigma } from '@lucide/svelte';
	import type { TuneBreakdown } from '$lib/tune-breakdown';

	/**
	 * Admin-only anatomy of a Tune card: why this place, and why here in the
	 * queue. The sibling of match-breakdown.svelte, built the same way, so the
	 * ranking is explainable rather than magic.
	 *
	 *   score = proximity + matchWeight * match + popularityWeight * popularity
	 *
	 * The three rows map one-to-one onto those terms. Each shows its raw input
	 * (how far, which twins, how many likes) next to what it actually
	 * contributed, because the normalized 0..1 middle step is the part that
	 * surprises people.
	 */
	let { tune, name }: { tune: TuneBreakdown; name: string } = $props();

	function fmt(n: number, digits = 2): string {
		return n.toFixed(digits);
	}
	function signed(n: number, digits = 2): string {
		return (n >= 0 ? '+' : '') + n.toFixed(digits);
	}

	/**
	 * The three weighted terms as they land in the sum. Proximity is signed, so
	 * the bar splits into what pushed the place up and what dragged it down.
	 */
	const terms = $derived([
		{
			key: 'proximity',
			label: 'Proximity',
			value: tune.proximity,
			detail:
				tune.distanceKm <= tune.negativeAtKm
					? `${fmt(tune.distanceKm, 1)} km, inside the ${tune.negativeAtKm} km crossover`
					: `${fmt(tune.distanceKm, 1)} km, past the ${tune.negativeAtKm} km crossover`,
			color: 'var(--primary)'
		},
		{
			key: 'match',
			label: 'Taste match',
			value: tune.matchContribution,
			detail:
				tune.twinCount === 0
					? 'no twin of yours has liked this'
					: `${tune.twinCount} twin${tune.twinCount === 1 ? '' : 's'} liked it, ${fmt(tune.tasteScore, 2)} of the ${fmt(tune.maxTasteScore, 2)} best nearby`,
			color: 'var(--primary)'
		},
		{
			key: 'popularity',
			label: 'Popularity',
			value: tune.popularityContribution,
			detail:
				tune.likeCount === 0
					? 'nobody on the platform has liked this'
					: `${tune.likeCount} like${tune.likeCount === 1 ? '' : 's'}, against ${tune.maxLikeCount} on the busiest nearby`,
			color: 'var(--muted-foreground)'
		}
	]);

	/** Widths for the contribution bar, scaled to the largest absolute term. */
	const barMax = $derived(Math.max(...terms.map((t) => Math.abs(t.value)), 0.001));

	/**
	 * Plain-language read of what put this card in front of you, so the panel
	 * answers "why this one" without the reader doing the algebra.
	 */
	const verdict = $derived.by(() => {
		const positive = terms.filter((t) => t.value > 0).sort((a, b) => b.value - a.value);
		const lead = positive[0];
		const parts: string[] = [];

		if (!lead) return `Every term is zero or negative, so ${name} should not have been queued.`;

		if (lead.key === 'proximity') {
			parts.push(`${name} is here mostly because it's close`);
		} else if (lead.key === 'match') {
			parts.push(`${name} is here mostly because your twins like it`);
		} else {
			parts.push(`${name} is here mostly because it's popular`);
		}

		if (tune.proximity < 0) {
			parts.push(
				`distance is working against it (${signed(tune.proximity)}), and its signal is what keeps it above zero`
			);
		}
		if (tune.twinCount === 0 && tune.likeCount === 0) {
			parts.push(
				'nothing but proximity is carrying it, so it would drop out from any further away'
			);
		}
		if (tune.match === 1 && tune.maxTasteScore > 0) {
			parts.push('it holds the strongest taste signal of anything gathered this round');
		}
		return `${parts.join(', ')}.`;
	});
</script>

<Card.Root class="mt-4">
	<Card.Header>
		<!-- The same Shield the nav and the user admin badge use, since this panel
		     sits on a page every signed-in user sees. -->
		<Card.Title class="flex items-center gap-2">
			<Shield class="text-muted-foreground size-4" />
			Analysis
		</Card.Title>
		<Card.Description>Why this card, and why here in the queue.</Card.Description>
	</Card.Header>

	<Card.Content class="min-w-0 space-y-5">
		<!-- Headline: the blended score and where it landed in the queue -->
		<div class="flex items-end justify-between gap-3">
			<div class="flex items-baseline gap-2">
				<span class="text-4xl font-semibold tabular-nums">{fmt(tune.score)}</span>
				<span class="text-muted-foreground text-sm">score</span>
			</div>
			<Badge variant="outline">
				#{tune.rank} of {tune.candidateCount}
			</Badge>
		</div>

		<p class="text-muted-foreground text-sm">{verdict}</p>

		<!-- The three terms, raw input next to what it contributed -->
		<div class="space-y-3">
			{#each terms as t (t.key)}
				<div>
					<div class="flex items-baseline justify-between gap-3">
						<span class="text-sm font-medium">{t.label}</span>
						<span
							class="text-sm font-semibold tabular-nums {t.value < 0
								? 'text-destructive'
								: t.value === 0
									? 'text-muted-foreground'
									: ''}"
						>
							{signed(t.value)}
						</span>
					</div>
					<!-- Centre line at zero, so a negative proximity reads as a drag. -->
					<div class="relative mt-1 h-2">
						<div class="bg-muted absolute inset-0 rounded-full"></div>
						<div class="bg-border absolute top-0 bottom-0 left-1/2 w-px"></div>
						<div
							class="absolute top-0 bottom-0 rounded-full {t.value < 0
								? 'bg-destructive'
								: 'bg-primary'}"
							style="left:{t.value < 0
								? 50 - (Math.abs(t.value) / barMax) * 50
								: 50}%; width:{(Math.abs(t.value) / barMax) * 50}%"
						></div>
					</div>
					<p class="text-muted-foreground mt-1 text-xs">{t.detail}</p>
				</div>
			{/each}
		</div>

		<!-- The arithmetic, spelled out. Wraps between terms so a narrow screen
		     never gets a sideways scroll. -->
		<div
			class="text-muted-foreground bg-muted/40 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border px-3 py-2 font-mono text-xs"
		>
			<Sigma class="size-3.5 shrink-0" />
			<span class="whitespace-nowrap">{signed(tune.proximity)} proximity</span>
			<span class="whitespace-nowrap">
				+ {tune.matchWeight} × {fmt(tune.match)} match
			</span>
			<span class="whitespace-nowrap">
				+ {tune.popularityWeight} × {fmt(tune.popularity)} popularity
			</span>
			<span class="whitespace-nowrap">
				= <span class="text-foreground font-semibold">{fmt(tune.score)}</span>
			</span>
		</div>

		<!-- The normalization is per request, which is the panel's whole reason
		     for existing, so it gets stated rather than implied. -->
		<p class="text-muted-foreground text-xs">
			Match and popularity are normalized against the {tune.gatheredCount} places gathered within {tune.maxDistanceKm}
			km of you on this load, of which {tune.candidateCount} scored above zero. Both are relative, so
			this place scores differently from a different location.
		</p>
	</Card.Content>
</Card.Root>
