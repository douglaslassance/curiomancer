<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import { Shield, Sigma, ThumbsDown, ThumbsUp } from '@lucide/svelte';
	import { categoryLabel } from '$lib/place-category';
	import type { MatchBreakdown } from '$lib/match-breakdown';

	/**
	 * Admin-only anatomy of a match score: every term of the similarity formula,
	 * drawn so the number is explainable rather than magic.
	 *
	 *   cosine = (agreements - disagreements) / sqrt(yourTotal * theirTotal)
	 *   direct = cosine * min(shared, FLOOR) / FLOOR
	 *   score  = direct + propagated        (see taste-graph.ts)
	 *
	 * The three tiles map one-to-one onto those terms: what you agreed on, how
	 * much opinion each of you spread that agreement over, and how much the
	 * thin-overlap damping held the result back.
	 */
	let { match, name }: { match: MatchBreakdown; name: string } = $props();

	/** Same clamp the avatar ring uses: negative similarity reads as 0%. */
	const pct = $derived(
		match.score === null ? null : Math.max(0, Math.min(100, Math.round(match.score * 100)))
	);
	const net = $derived(match.agreements - match.disagreements);
	const reach = $derived(Math.sqrt(match.viewerTotal * match.targetTotal));
	const thresholdPct = $derived(Math.round(match.threshold * 100));

	function fmt(n: number, digits = 2): string {
		return n.toFixed(digits);
	}
	function signed(n: number): string {
		return n > 0 ? `+${n}` : `${n}`;
	}

	/**
	 * Plain-language read of what is holding the score back (or lifting it), so
	 * the panel answers "why this number" without the reader doing the algebra.
	 */
	const verdict = $derived.by(() => {
		if (match.score === null) {
			if (match.viewerTotal === 0)
				return 'You have no likes or dislikes yet, so there is nothing to compare against.';
			if (match.targetTotal === 0)
				return `${name} has no likes or dislikes yet, so there is nothing to compare against.`;
			return `You and ${name} have not rated any of the same places, and no chain of matches connects you, so there is no signal either way.`;
		}
		// A score with no overlap of its own came entirely through other people,
		// so the agreement sentence below would be describing an empty set.
		if (match.sharedCount === 0) {
			return `You and ${name} have not rated any of the same places. This score reaches you entirely through people you both match with.`;
		}
		const parts: string[] = [];
		if (match.disagreements > match.agreements) {
			parts.push(
				`You disagree more often than you agree (${match.disagreements} of ${match.sharedCount} overlaps)`
			);
		} else if (match.disagreements === 0) {
			parts.push(`You agree on every one of the ${match.sharedCount} places you both rated`);
		} else {
			parts.push(
				`You agree on ${match.agreements} of the ${match.sharedCount} places you both rated`
			);
		}
		if (match.significance < 1) {
			parts.push(
				`but ${match.sharedCount} overlap${match.sharedCount === 1 ? '' : 's'} is below the ${match.significanceFloor}-place confidence floor, so the raw affinity is cut to ${Math.round(match.significance * 100)}%`
			);
		} else if (reach > 0) {
			parts.push(
				`spread across ${match.viewerTotal} of your opinions and ${match.targetTotal} of theirs`
			);
		}
		if ((match.propagatedScore ?? 0) > 0.001) {
			parts.push(
				`plus ${points(match.propagatedScore)} carried in through people you both match with`
			);
		}
		return `${parts.join(', ')}.`;
	});

	/** A score term as a percentage-point count, for the verdict sentence. */
	function points(v: number | null): string {
		return `${Math.round((v ?? 0) * 100)} points`;
	}

	// Venn geometry. Radii go as sqrt(total) so circle AREA tracks opinion count,
	// and the centres are pushed together in proportion to how much of the
	// smaller set is shared: no overlap leaves them tangent, a fully contained
	// set nests one inside the other.
	const venn = $derived.by(() => {
		const maxTotal = Math.max(match.viewerTotal, match.targetTotal, 1);
		const r = (total: number) => Math.max(18, 52 * Math.sqrt(total / maxTotal));
		const rV = r(match.viewerTotal);
		const rT = r(match.targetTotal);
		const smaller = Math.min(match.viewerTotal, match.targetTotal);
		const frac = smaller > 0 ? Math.min(1, match.sharedCount / smaller) : 0;
		const d = rV + rT - frac * 2 * Math.min(rV, rT);
		const cxV = 170 - d / 2;
		const cxT = 170 + d / 2;
		// Radical line: where the overlap lens actually sits, so the shared
		// count is labelled on the lens and not just between the two centres.
		const lensX = d < 1 ? 170 : cxV + (d * d - rT * rT + rV * rV) / (2 * d);
		// Region labels are exclusive, the way a Venn reads: the numbers in the
		// two crescents plus the lens add up to each person's total.
		return {
			rV,
			rT,
			cxV,
			cxT,
			lensX,
			cy: 74,
			labelY: 74 + Math.max(rV, rT) + 18,
			viewerOnly: match.viewerTotal - match.sharedCount,
			targetOnly: match.targetTotal - match.sharedCount
		};
	});

	/** One slot per shared opinion the confidence floor asks for. */
	const confidenceSlots = $derived(Array.from({ length: match.significanceFloor }, (_, i) => i));

	type Cat = 'eat' | 'drink' | 'shop' | 'visit';
	const CATEGORIES: Cat[] = ['eat', 'drink', 'shop', 'visit'];

	/** Per-category agreement split: where your tastes converge and where they fork. */
	const byCategory = $derived(
		CATEGORIES.map((category) => {
			const rows = match.shared.filter((s) => s.category === category);
			return {
				category,
				total: rows.length,
				agreements: rows.filter((s) => s.agrees).length,
				disagreements: rows.filter((s) => !s.agrees).length
			};
		}).filter((c) => c.total > 0)
	);
</script>

<Card.Root>
	<Card.Header>
		<!-- The same Shield the nav and the user admin badge use, since this panel
		     now sits on a profile any signed-in user can reach. -->
		<Card.Title class="flex items-center gap-2">
			<Shield class="text-muted-foreground size-4" />
			Analysis
		</Card.Title>
		<Card.Description>
			{#if match.isSelf}
				There is no pair to score on your own account.
			{:else}
				How your taste and {name}'s combine into the score, term by term.
			{/if}
		</Card.Description>
	</Card.Header>

	<!-- min-w-0: Card.Root is a flex column, so without it the nowrap formula
	     line and the shared-opinions table widen the whole card past the
	     viewport on narrow screens instead of scrolling inside themselves. -->
	<Card.Content class="min-w-0 space-y-6">
		{#if match.isSelf}
			<p class="text-muted-foreground text-sm">
				Open another user to see how your taste compares with theirs.
			</p>
		{:else}
			<!-- Headline: the score on a 0-100 scale, with the twin bar marked -->
			<div>
				<!-- With no score there is no scale to plot, so the sentence stands alone. -->
				{#if pct !== null}
					<div class="flex items-end justify-between gap-3">
						<div class="flex items-baseline gap-2">
							<span class="text-4xl font-semibold tabular-nums">{pct}%</span>
							<span class="text-muted-foreground text-sm">match</span>
						</div>
						<Badge variant={match.isTwin ? 'default' : 'outline'}>
							{match.isTwin ? 'Taste twin' : `Below the ${thresholdPct}% twin bar`}
						</Badge>
					</div>

					<div class="relative mt-3 pb-5">
						<div class="bg-muted h-2 overflow-hidden rounded-full">
							<div class="bg-primary h-full rounded-full" style="width:{pct}%"></div>
						</div>
						<!-- Twin threshold tick -->
						<div
							class="bg-foreground/50 absolute top-0 h-2 w-px"
							style="left:{thresholdPct}%"
						></div>
						<div
							class="text-muted-foreground absolute top-3 -translate-x-1/2 text-[10px] whitespace-nowrap"
							style="left:{thresholdPct}%"
						>
							{thresholdPct}% twin bar
						</div>
					</div>
				{:else}
					<div class="text-muted-foreground text-lg font-medium">No match signal</div>
				{/if}

				<p class="text-muted-foreground mt-1 text-sm">{verdict}</p>
			</div>

			{#if match.score !== null}
				<!-- The three terms of the formula -->
				<div class="grid gap-3 sm:grid-cols-3">
					<!-- 1. Net agreement over the overlap -->
					<div class="flex flex-col rounded-lg border p-3">
						<div class="text-muted-foreground text-xs">Agreement</div>
						<div class="mt-1 text-2xl font-semibold tabular-nums">{signed(net)}</div>
						<div class="text-muted-foreground text-xs">
							{match.agreements} agree · {match.disagreements} disagree
						</div>
						<div class="mt-auto pt-3">
							<div class="bg-muted flex h-2 overflow-hidden rounded-full">
								<div
									class="bg-primary h-full"
									style="width:{match.sharedCount
										? (100 * match.agreements) / match.sharedCount
										: 0}%"
								></div>
								<div
									class="bg-destructive h-full"
									style="width:{match.sharedCount
										? (100 * match.disagreements) / match.sharedCount
										: 0}%"
								></div>
							</div>
						</div>
					</div>

					<!-- 2. The norm those agreements are divided by -->
					<div class="flex flex-col rounded-lg border p-3">
						<div class="text-muted-foreground text-xs">Spread over</div>
						<div class="mt-1 text-2xl font-semibold tabular-nums">{fmt(reach, 1)}</div>
						<div class="text-muted-foreground text-xs">
							√({match.viewerTotal} yours × {match.targetTotal} theirs)
						</div>
						<div class="text-muted-foreground mt-2 text-xs">
							Opinions you do not share still count, so agreeing on a few places out of many cannot
							read as a perfect match.
						</div>
					</div>

					<!-- 3. Significance damping -->
					<div class="flex flex-col rounded-lg border p-3">
						<div class="text-muted-foreground text-xs">Confidence</div>
						<div class="mt-1 text-2xl font-semibold tabular-nums">
							{fmt(match.significance, 2)}×
						</div>
						<div class="text-muted-foreground text-xs">
							{Math.min(match.sharedCount, match.significanceFloor)} of {match.significanceFloor} shared
							opinions
						</div>
						<div class="mt-auto flex gap-1 pt-3">
							{#each confidenceSlots as slot (slot)}
								<div
									class="h-2 flex-1 rounded-full {slot < match.sharedCount
										? 'bg-primary'
										: 'bg-muted'}"
								></div>
							{/each}
						</div>
					</div>
				</div>

				<!-- The arithmetic, spelled out. Each term is kept whole but the line
				     wraps between them, so a narrow screen never gets a sideways
				     scroll (nor widens the card to fit one long unbreakable line). -->
				<div
					class="text-muted-foreground bg-muted/40 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border px-3 py-2 font-mono text-xs"
				>
					<Sigma class="size-3.5 shrink-0" />
					<span class="whitespace-nowrap">
						{signed(net)} ÷ {fmt(reach, 1)} = {match.cosine === null ? '-' : fmt(match.cosine, 3)}
						raw affinity
					</span>
					<span class="whitespace-nowrap">× {fmt(match.significance, 2)} confidence</span>
					<span class="whitespace-nowrap">
						= {match.directScore === null ? '-' : fmt(match.directScore, 3)} direct
					</span>
					<!-- The propagated term is what these two didn't measure themselves:
					     similarity that reached them along chains of other matches. -->
					<span class="whitespace-nowrap">
						+ {match.propagatedScore === null ? '-' : fmt(match.propagatedScore, 3)} propagated
					</span>
					<span class="whitespace-nowrap">
						= <span class="text-foreground font-semibold">{fmt(match.score, 3)}</span>
						→ {pct}%
					</span>
				</div>

				<div class="grid gap-4 lg:grid-cols-2">
					<!-- Overlap: how much of each taste profile the other one touches -->
					<div class="rounded-lg border p-3">
						<div class="text-sm font-medium">Overlap</div>
						<p class="text-muted-foreground mt-1 text-xs">
							Circle area is each person's opinion count. The lens is what you both rated, the
							crescents what only one of you did.
						</p>
						{#if match.viewerTotal > 0 && match.targetTotal > 0}
							<svg viewBox="0 0 340 158" class="mt-2 w-full" role="img" aria-hidden="true">
								<circle
									cx={venn.cxV}
									cy={venn.cy}
									r={venn.rV}
									fill="var(--primary)"
									fill-opacity="0.22"
									stroke="var(--primary)"
								/>
								<circle
									cx={venn.cxT}
									cy={venn.cy}
									r={venn.rT}
									fill="var(--muted-foreground)"
									fill-opacity="0.22"
									stroke="var(--muted-foreground)"
								/>
								{#if venn.viewerOnly > 0}
									<text
										x={venn.cxV - venn.rV * 0.45}
										y={venn.cy}
										text-anchor="middle"
										dominant-baseline="middle"
										fill="currentColor"
										font-size="13"
										font-weight="600">{venn.viewerOnly}</text
									>
								{/if}
								{#if venn.targetOnly > 0}
									<text
										x={venn.cxT + venn.rT * 0.45}
										y={venn.cy}
										text-anchor="middle"
										dominant-baseline="middle"
										fill="currentColor"
										font-size="13"
										font-weight="600">{venn.targetOnly}</text
									>
								{/if}
								{#if match.sharedCount > 0}
									<text
										x={venn.lensX}
										y={venn.cy}
										text-anchor="middle"
										dominant-baseline="middle"
										fill="currentColor"
										font-size="13"
										font-weight="600">{match.sharedCount}</text
									>
								{/if}
								<text
									x={venn.cxV - venn.rV * 0.45}
									y={venn.labelY}
									text-anchor="middle"
									fill="var(--muted-foreground)"
									font-size="11">You</text
								>
								<text
									x={venn.cxT + venn.rT * 0.45}
									y={venn.labelY}
									text-anchor="middle"
									fill="var(--muted-foreground)"
									font-size="11">{name.split(/\s+/)[0]}</text
								>
							</svg>
							<p class="text-muted-foreground text-center text-xs">
								{match.viewerTotal} yours · {match.targetTotal}
								theirs · {match.sharedCount} shared
							</p>
						{:else}
							<p class="text-muted-foreground mt-3 text-sm">
								No opinions on one side, so there is nothing to overlap.
							</p>
						{/if}
					</div>

					<!-- Where the agreement actually lives -->
					<div class="rounded-lg border p-3">
						<div class="text-sm font-medium">Agreement by category</div>
						<p class="text-muted-foreground mt-1 text-xs">
							Which kinds of place you two converge on, and which you fork on.
						</p>
						{#if byCategory.length > 0}
							<div class="mt-3 space-y-2">
								{#each byCategory as c (c.category)}
									<div class="flex items-center gap-2">
										<div class="text-muted-foreground w-20 shrink-0 text-xs">
											{categoryLabel(c.category)}
										</div>
										<div class="bg-muted flex h-3 flex-1 overflow-hidden rounded-full">
											<div
												class="bg-primary h-full"
												style="width:{(100 * c.agreements) / c.total}%"
											></div>
											<div
												class="bg-destructive h-full"
												style="width:{(100 * c.disagreements) / c.total}%"
											></div>
										</div>
										<div
											class="text-muted-foreground w-16 shrink-0 text-right text-xs tabular-nums"
										>
											{c.agreements}/{c.total}
										</div>
									</div>
								{/each}
							</div>
						{:else}
							<p class="text-muted-foreground mt-3 text-sm">No shared opinions yet.</p>
						{/if}
					</div>
				</div>

				<!-- The raw evidence -->
				{#if match.shared.length > 0}
					<div>
						<div class="text-sm font-medium">
							Shared opinions ({match.shared.length})
						</div>
						<!-- grid wrapper: a scroll container that is a grid item gets an
						     automatic minimum size of 0, which is what stops the table's
						     min-content width from widening the whole card on mobile.
						     overflow-x-auto alone does not do that. -->
						<div class="mt-2 grid">
							<div class="overflow-x-auto rounded-lg border">
								<table class="w-full text-sm">
									<thead class="border-b">
										<tr class="text-muted-foreground text-left text-xs tracking-wide uppercase">
											<th class="px-3 py-2 font-medium">Place</th>
											<th class="px-3 py-2 font-medium">Category</th>
											<th class="px-3 py-2 text-center font-medium">You</th>
											<th class="px-3 py-2 text-center font-medium">Them</th>
											<th class="px-3 py-2 text-right font-medium">Weight</th>
										</tr>
									</thead>
									<tbody>
										{#each match.shared as s (s.placeId)}
											<tr class="border-b last:border-b-0">
												<td class="px-3 py-2">
													<span class="font-medium">{s.name}</span>
													<span class="text-muted-foreground ml-1 text-xs">{s.city}</span>
												</td>
												<td class="text-muted-foreground px-3 py-2 text-xs">
													{categoryLabel(s.category)}
												</td>
												<td class="px-3 py-2 text-center">
													{#if s.viewerKind === 'liked'}
														<ThumbsUp class="text-primary mx-auto size-3.5" />
													{:else}
														<ThumbsDown class="text-destructive mx-auto size-3.5" />
													{/if}
												</td>
												<td class="px-3 py-2 text-center">
													{#if s.targetKind === 'liked'}
														<ThumbsUp class="text-primary mx-auto size-3.5" />
													{:else}
														<ThumbsDown class="text-destructive mx-auto size-3.5" />
													{/if}
												</td>
												<td
													class="px-3 py-2 text-right text-xs font-medium tabular-nums {s.agrees
														? 'text-primary'
														: 'text-destructive'}"
												>
													{s.agrees ? '+1' : '-1'}
												</td>
											</tr>
										{/each}
									</tbody>
								</table>
							</div>
						</div>
					</div>
				{/if}
			{/if}
		{/if}
	</Card.Content>
</Card.Root>
