<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import { Users } from '@lucide/svelte';

	let { data } = $props();
	const t = $derived(data.tune);
	const m = $derived(data.matching);
</script>

<div class="flex flex-col gap-4">
	<div>
		<h2 class="flex items-center gap-2 text-lg font-semibold"><Users class="size-5" /> Twins</h2>
		<p class="text-muted-foreground mt-1 text-sm">
			Who your taste makes you similar to, and what it unlocks.
		</p>
	</div>

	<Card.Root>
		<Card.Content class="flex flex-col gap-3 text-sm">
			<p class="text-muted-foreground">
				A <strong>twin</strong> is anyone whose Match score with you clears
				<strong class="tabular-nums">{m.MATCH_THRESHOLD}</strong>. That one bar is used everywhere
				twins appear - the people list, the profile "match %", and who can reach you.
			</p>
			<p class="text-muted-foreground">
				Twins power your <strong>recommendations</strong>: places your top
				<strong class="tabular-nums">{t.TWIN_LIMIT}</strong> twins liked that you haven't rated yet,
				weighted by how strong each twin is. No twins above the bar means no recommendations - the
				dashboard nudges you to Tune instead.
			</p>
			<p class="text-muted-foreground">
				Twins also gate access: viewing someone's profile and starting a chat are both twins-only, so
				a stranger can't browse or message you.
			</p>
			<p class="text-muted-foreground">
				<strong>Incognito</strong> users are the exception to visibility - they never surface as
				anyone's twin and their profile stays private, but their likes still count toward other
				people's recommendations.
			</p>
		</Card.Content>
	</Card.Root>
</div>
