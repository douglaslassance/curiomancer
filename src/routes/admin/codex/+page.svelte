<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import { MapPin } from '@lucide/svelte';

	let { data } = $props();
	const t = $derived(data.tune);

	// "Reach": how far a place can be and still score > 0 in Tune, given its
	// signal. proximity = 1 - d/NEGATIVE_AT_KM, so score hits 0 at
	// d = NEGATIVE_AT_KM * (1 + weight).
	const matchReach = $derived(Math.round(t.NEGATIVE_AT_KM * (1 + t.MATCH_WEIGHT)));
	const popReach = $derived(Math.round(t.NEGATIVE_AT_KM * (1 + t.POPULARITY_WEIGHT)));
	const maxReach = $derived(
		Math.round(t.NEGATIVE_AT_KM * (1 + t.MATCH_WEIGHT + t.POPULARITY_WEIGHT))
	);
</script>

<div class="flex flex-col gap-4">
	<div>
		<h2 class="flex items-center gap-2 text-lg font-semibold"><MapPin class="size-5" /> Tune</h2>
		<p class="text-muted-foreground mt-1 text-sm">How the next place to rate is chosen.</p>
	</div>

	<Card.Root>
		<Card.Content class="flex flex-col gap-3 text-sm">
			<pre class="bg-muted overflow-x-auto rounded-lg p-3 text-xs leading-relaxed"><code
					>proximity = 1 - distance / {t.NEGATIVE_AT_KM}km      (+ up close, - past {t.NEGATIVE_AT_KM}km)
score     = proximity + {t.MATCH_WEIGHT} × match + {t.POPULARITY_WEIGHT} × popularity

show the place only if score {'>'} 0 · never gather past {t.MAX_DISTANCE_KM}km</code
				></pre>
			<p class="text-muted-foreground">
				Distance is a plus up close and a growing minus past the crossover, so a match or some
				popularity buys a place extra reach, but distance always wins. A close place with no signal
				still shows (fresh spots stay discoverable); a far-but-popular place is dragged below zero and
				hidden. When nothing clears zero the queue is empty on purpose. "Come back later" beats
				filler.
			</p>
			<ul class="text-muted-foreground list-inside list-disc">
				<li>A perfect taste match stays visible out to <strong>~{matchReach}km</strong>.</li>
				<li>A maximally popular place reaches <strong>~{popReach}km</strong>.</li>
				<li>Nothing shows past <strong>~{maxReach}km</strong>.</li>
			</ul>

			<dl class="mt-1 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 border-t pt-3">
				<dt class="font-medium tabular-nums">{t.NEGATIVE_AT_KM} km</dt>
				<dd class="text-muted-foreground">Crossover: distance stops helping, starts hurting.</dd>
				<dt class="font-medium tabular-nums">{t.MAX_DISTANCE_KM} km</dt>
				<dd class="text-muted-foreground">Hard stop: farther places are never gathered or shown.</dd>
				<dt class="font-medium tabular-nums">{t.MATCH_WEIGHT}</dt>
				<dd class="text-muted-foreground">Weight of a full taste match (see Match).</dd>
				<dt class="font-medium tabular-nums">{t.POPULARITY_WEIGHT}</dt>
				<dd class="text-muted-foreground">
					Weight of full popularity (platform likes, log-scaled), kept below match on purpose.
				</dd>
			</dl>
		</Card.Content>
	</Card.Root>
</div>
