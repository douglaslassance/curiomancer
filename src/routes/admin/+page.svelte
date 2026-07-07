<script lang="ts">
	import { Bookmark, Eye, ThumbsDown, ThumbsUp } from '@lucide/svelte';
	import * as Card from '$lib/components/ui/card';
	import LocationBubbleMap from '$lib/components/location-bubble-map.svelte';

	let { data } = $props();
	const s = $derived(data.stats);

	function pct(n: number, d: number): string {
		return d > 0 ? `${Math.round((100 * n) / d)}%` : 'n/a';
	}

	function money(cents: number): string {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: 'USD',
			minimumFractionDigits: cents % 100 === 0 ? 0 : 2
		}).format(cents / 100);
	}

	// "Total users" is deliberately absent here - it's the same number as the
	// users map's headline count below, just without the map.
	const headlineStats = $derived([
		{
			label: 'Active users',
			value: data.headline.dau.toLocaleString(),
			hint: `${data.headline.wau.toLocaleString()} weekly · ${data.headline.mau.toLocaleString()} monthly`
		},
		{ label: 'Subscribers', value: data.headline.subscribers.toLocaleString() },
		{ label: 'MRR', value: money(data.headline.mrrCents), hint: 'monthly recurring' },
		{
			label: 'Rec conversion',
			value: pct(data.conversionTotals.conversions, data.conversionTotals.impressions),
			hint: `${pct(data.conversionTotals.twinConversions, data.conversionTotals.twinImpressions)} twin, ${pct(data.conversionTotals.popularConversions, data.conversionTotals.popularImpressions)} popular · last 30d`
		}
	]);
</script>

<svelte:head>
	<title>Admin · Overview · Curiomancer</title>
</svelte:head>

<div class="grid gap-4 lg:grid-cols-2">
	<!-- Users, by location -->
	<div class="bg-card flex flex-col gap-4 rounded-xl border p-4 sm:flex-row sm:items-center">
		<div class="shrink-0 sm:w-32">
			<p class="text-3xl font-semibold tabular-nums">{data.userLocationStats.total}</p>
			<p class="text-muted-foreground text-sm">
				{data.userLocationStats.total === 1 ? 'user' : 'users'}
			</p>
		</div>
		<div class="h-48 sm:flex-1">
			<LocationBubbleMap
				locations={data.userLocationStats.locations}
				tooltipLabel={(n) => `${n} ${n === 1 ? 'user' : 'users'}`}
			/>
		</div>
	</div>

	<!-- Waitlist, by location -->
	<div class="bg-card flex flex-col gap-4 rounded-xl border p-4 sm:flex-row sm:items-center">
		<div class="shrink-0 sm:w-32">
			<p class="text-3xl font-semibold tabular-nums">{data.waitlistStats.total}</p>
			<p class="text-muted-foreground text-sm">
				{data.waitlistStats.total === 1 ? 'person' : 'people'} on the waitlist
			</p>
		</div>
		<div class="h-48 sm:flex-1">
			<LocationBubbleMap
				locations={data.waitlistStats.locations}
				tooltipLabel={(n) => `${n} ${n === 1 ? 'person' : 'people'} on the waitlist`}
			/>
		</div>
	</div>
</div>

<div class="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
	<!-- Users -->
	<Card.Root>
		<Card.Content>
			<h2 class="text-muted-foreground text-xs font-medium uppercase tracking-wide">Users</h2>
			<p class="mt-2 text-3xl font-semibold tabular-nums">{s.users}</p>
			<p class="text-muted-foreground mt-1 text-xs">{s.admins} admin{s.admins === 1 ? '' : 's'}</p>
		</Card.Content>
	</Card.Root>

	<!-- Places -->
	<Card.Root>
		<Card.Content>
			<h2 class="text-muted-foreground text-xs font-medium uppercase tracking-wide">Places</h2>
			<p class="mt-2 text-3xl font-semibold tabular-nums">{s.places}</p>
			<p class="text-muted-foreground mt-1 text-xs">
				{s.places_apple} apple · {s.places_manual} manual · {s.places_seed} seed
			</p>
		</Card.Content>
	</Card.Root>

	<!-- Ratings -->
	<Card.Root>
		<Card.Content>
			<h2 class="text-muted-foreground text-xs font-medium uppercase tracking-wide">Ratings</h2>
			<p class="mt-2 text-3xl font-semibold tabular-nums">
				{s.liked + s.disliked + s.seen + s.want_to_go}
			</p>
			<div class="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
				<span class="inline-flex items-center gap-1"><ThumbsUp class="size-3" />{s.liked}</span>
				<span class="inline-flex items-center gap-1"><Bookmark class="size-3" />{s.want_to_go}</span
				>
				<span class="inline-flex items-center gap-1"><Eye class="size-3" />{s.seen}</span>
				<span class="inline-flex items-center gap-1"><ThumbsDown class="size-3" />{s.disliked}</span
				>
			</div>
		</Card.Content>
	</Card.Root>

	<!-- Invites -->
	<Card.Root>
		<Card.Content>
			<h2 class="text-muted-foreground text-xs font-medium uppercase tracking-wide">Invites</h2>
			<p class="mt-2 text-3xl font-semibold tabular-nums">
				{s.invites_redeemed} / {s.invites_total}
			</p>
			<p class="text-muted-foreground mt-1 text-xs">redeemed</p>
		</Card.Content>
	</Card.Root>
</div>

<!-- Growth headline numbers - point-in-time snapshots, not trends over time
     (see the Growth tab for those). -->
<div class="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
	{#each headlineStats as hs (hs.label)}
		<Card.Root>
			<Card.Header class="pb-2">
				<Card.Description>{hs.label}</Card.Description>
				<Card.Title class="text-3xl tabular-nums">{hs.value}</Card.Title>
			</Card.Header>
			{#if hs.hint}
				<Card.Content class="text-muted-foreground pt-0 text-xs">{hs.hint}</Card.Content>
			{/if}
		</Card.Root>
	{/each}
</div>
