<script lang="ts">
	import { AreaChart, BarChart, LineChart } from 'layerchart';
	import * as Chart from '$lib/components/ui/chart';
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';

	let { data } = $props();

	// LayerChart wants Date objects on the x-axis for a proper time scale.
	const signups = $derived(data.signups.map((d) => ({ ...d, date: new Date(d.day) })));
	const subscribers = $derived(data.subscribers.map((d) => ({ ...d, date: new Date(d.day) })));
	const active = $derived(data.active.map((d) => ({ ...d, date: new Date(d.day) })));
	// Rate per day per reason, null (not 0) on days with no impressions so
	// the line gaps instead of misleadingly dropping to the floor.
	const conversion = $derived(
		data.conversion.map((d) => ({
			date: new Date(d.day),
			twinRate: d.twinImpressions > 0 ? (100 * d.twinConversions) / d.twinImpressions : null,
			popularRate:
				d.popularImpressions > 0 ? (100 * d.popularConversions) / d.popularImpressions : null
		}))
	);

	function shortDate(d: Date): string {
		return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	}

	function setRange(days: number) {
		const url = new URL(page.url);
		url.searchParams.set('range', String(days));
		goto(url, { replaceState: true, keepFocus: true, noScroll: true });
	}

	const usersConfig = {
		totalUsers: { label: 'Total users', color: 'var(--chart-1)' }
	} satisfies Chart.ChartConfig;

	const signupsConfig = {
		newUsers: { label: 'Signups', color: 'var(--chart-1)' }
	} satisfies Chart.ChartConfig;

	const activeConfig = {
		activeDay: { label: 'DAU', color: 'var(--chart-1)' },
		activeWeek: { label: 'WAU', color: 'var(--chart-2)' },
		activeMonth: { label: 'MAU', color: 'var(--chart-3)' }
	} satisfies Chart.ChartConfig;

	const subsConfig = {
		subscribers: { label: 'Subscribers', color: 'var(--chart-1)' }
	} satisfies Chart.ChartConfig;

	const conversionConfig = {
		twinRate: { label: 'Twin match', color: 'var(--chart-1)' },
		popularRate: { label: 'Popular fallback', color: 'var(--chart-3)' }
	} satisfies Chart.ChartConfig;
</script>

<div class="space-y-6">
	<!-- Range selector -->
	<div class="flex items-center justify-between">
		<h2 class="text-lg font-medium">Growth</h2>
		<div class="flex gap-1">
			{#each data.ranges as r (r)}
				<Button
					size="sm"
					variant={data.days === r ? 'default' : 'outline'}
					onclick={() => setRange(r)}
				>
					{r}d
				</Button>
			{/each}
		</div>
	</div>

	<div class="grid gap-4 lg:grid-cols-2">
		<!-- Total users (cumulative) -->
		<Card.Root>
			<Card.Header>
				<Card.Title>Total users</Card.Title>
				<Card.Description>Cumulative signups</Card.Description>
			</Card.Header>
			<Card.Content>
				<Chart.Container config={usersConfig} class="h-[220px] w-full">
					<AreaChart
						data={signups}
						x="date"
						series={[{ key: 'totalUsers', label: 'Total users', color: 'var(--color-totalUsers)' }]}
						props={{
							area: { motion: 'tween' },
							xAxis: { format: shortDate },
							yAxis: { format: (v: number) => v.toLocaleString() }
						}}
					>
						{#snippet tooltip()}
							<Chart.Tooltip labelFormatter={(v: Date) => shortDate(v)} />
						{/snippet}
					</AreaChart>
				</Chart.Container>
			</Card.Content>
		</Card.Root>

		<!-- New signups per day -->
		<Card.Root>
			<Card.Header>
				<Card.Title>Signups</Card.Title>
				<Card.Description>Per day</Card.Description>
			</Card.Header>
			<Card.Content>
				<Chart.Container config={signupsConfig} class="h-[220px] w-full">
					<BarChart
						data={signups}
						x="date"
						series={[{ key: 'newUsers', label: 'Signups', color: 'var(--color-newUsers)' }]}
						props={{ xAxis: { format: shortDate, ticks: 6 }, yAxis: { ticks: 4 } }}
					>
						{#snippet tooltip()}
							<Chart.Tooltip labelFormatter={(v: Date) => shortDate(v)} />
						{/snippet}
					</BarChart>
				</Chart.Container>
			</Card.Content>
		</Card.Root>

		<!-- Active users DAU/WAU/MAU -->
		<Card.Root>
			<Card.Header>
				<Card.Title>Active users</Card.Title>
				<Card.Description>Daily, weekly, monthly actives</Card.Description>
			</Card.Header>
			<Card.Content>
				<Chart.Container config={activeConfig} class="h-[220px] w-full">
					<LineChart
						data={active}
						x="date"
						series={[
							{ key: 'activeMonth', label: 'MAU', color: 'var(--color-activeMonth)' },
							{ key: 'activeWeek', label: 'WAU', color: 'var(--color-activeWeek)' },
							{ key: 'activeDay', label: 'DAU', color: 'var(--color-activeDay)' }
						]}
						props={{ xAxis: { format: shortDate } }}
					>
						{#snippet tooltip()}
							<Chart.Tooltip labelFormatter={(v: Date) => shortDate(v)} />
						{/snippet}
					</LineChart>
				</Chart.Container>
			</Card.Content>
		</Card.Root>

		<!-- Subscribers -->
		<Card.Root>
			<Card.Header>
				<Card.Title>Subscribers</Card.Title>
				<Card.Description>Active paid subscriptions</Card.Description>
			</Card.Header>
			<Card.Content>
				<Chart.Container config={subsConfig} class="h-[220px] w-full">
					<AreaChart
						data={subscribers}
						x="date"
						series={[
							{ key: 'subscribers', label: 'Subscribers', color: 'var(--color-subscribers)' }
						]}
						props={{ area: { motion: 'tween' }, xAxis: { format: shortDate } }}
					>
						{#snippet tooltip()}
							<Chart.Tooltip labelFormatter={(v: Date) => shortDate(v)} />
						{/snippet}
					</AreaChart>
				</Chart.Container>
			</Card.Content>
		</Card.Root>

		<!-- Recommendation conversion -->
		<Card.Root class="lg:col-span-2">
			<Card.Header>
				<Card.Title>Recommendation conversion</Card.Title>
				<Card.Description
					>Share of recommended places that turn into a like, by reason</Card.Description
				>
			</Card.Header>
			<Card.Content>
				<Chart.Container config={conversionConfig} class="h-[220px] w-full">
					<LineChart
						data={conversion}
						x="date"
						series={[
							{ key: 'twinRate', label: 'Twin match', color: 'var(--color-twinRate)' },
							{ key: 'popularRate', label: 'Popular fallback', color: 'var(--color-popularRate)' }
						]}
						props={{
							xAxis: { format: shortDate },
							yAxis: { format: (v: number) => `${v}%` }
						}}
					>
						{#snippet tooltip()}
							<Chart.Tooltip labelFormatter={(v: Date) => shortDate(v)} />
						{/snippet}
					</LineChart>
				</Chart.Container>
			</Card.Content>
		</Card.Root>
	</div>
</div>
