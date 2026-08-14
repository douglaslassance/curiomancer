<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import { Sparkles } from '@lucide/svelte';

	let { data } = $props();
	const m = $derived(data.matching);
</script>

<div class="flex flex-col gap-4">
	<div>
		<h2 class="flex items-center gap-2 text-lg font-semibold"><Sparkles class="size-5" /> Match</h2>
		<p class="text-muted-foreground mt-1 text-sm">
			How two people's tastes are scored against each other.
		</p>
	</div>

	<Card.Root>
		<Card.Content class="flex flex-col gap-3 text-sm">
			<pre class="bg-muted overflow-x-auto rounded-lg p-3 text-xs leading-relaxed"><code
					>cosine = (agreements - disagreements) / √(your opinions × their opinions)
score  = cosine × min(shared, {m.SIGNIFICANCE_FLOOR}) / {m.SIGNIFICANCE_FLOOR}</code
				></pre>
			<p class="text-muted-foreground">
				Each place you both rated is a vote of +1 or -1: liked is +1, disliked is -1 (a "been there"
				or "want to go" carries no taste signal). The score is the cosine similarity of those two
				vectors, so lining up on distinctive places counts more than agreeing on everything. Range is
				-1 to +1, shown as a 0 to 100% badge (negatives clamp to 0).
			</p>
			<p class="text-muted-foreground">
				The second factor is significance weighting: below <strong
					>{m.SIGNIFICANCE_FLOOR} shared opinions</strong
				> a pair's score is damped, so a lucky agreement on one or two places can't masquerade as a
				strong match.
			</p>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title class="text-base">Propagation</Card.Title>
		</Card.Header>
		<Card.Content class="flex flex-col gap-3 text-sm">
			<pre class="bg-muted overflow-x-auto rounded-lg p-3 text-xs leading-relaxed"><code
					>S = A + {m.PROPAGATION_DECAY} x A²        (A = the pairwise score above)</code
				></pre>
			<p class="text-muted-foreground">
				The score above only exists between people who have rated some of the same places, which is
				most pairs at zero. So similarity travels: if you match someone who matches someone else,
				some of that reaches you. Every chain of two links contributes the product of its links,
				damped by <strong class="tabular-nums">{m.PROPAGATION_DECAY}</strong>, and the chains add up
				— several weak connections through different people amount to a real signal, where any single
				one of them would not.
			</p>
			<p class="text-muted-foreground">
				Signs carry through the multiplication, so agreeing with someone who agrees with X counts
				toward X, and so does disagreeing with someone who disagrees with X. Neither is a special
				case; both fall out of the arithmetic.
			</p>
			<p class="text-muted-foreground">
				Similarity travels <strong class="tabular-nums">{m.PROPAGATION_DEPTH}</strong> steps — direct,
				plus one intermediary — through your <strong class="tabular-nums"
					>{m.PROPAGATION_VIA_LIMIT}</strong
				> strongest direct matches. Each further step costs another pass over everyone's ratings while
				contributing less, and pushed far enough every walk of this kind converges on "what is popular",
				which Tune already accounts for on its own.
			</p>
			<p class="text-muted-foreground">
				<strong>S is the only score the product uses.</strong> A twin is anyone whose S clears the
				threshold, and recommendations are weighted by the same S, so who you match with and whose
				places you see can never disagree. Nothing downstream distinguishes a score earned directly
				from one earned through someone else, and neither does anything shown to the user.
			</p>
		</Card.Content>
	</Card.Root>
</div>
