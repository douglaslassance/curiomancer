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
</div>
