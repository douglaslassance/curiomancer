<script lang="ts">
	import { MapPin, RefreshCw, Loader2 } from '@lucide/svelte';
	import type { UserLocation } from '$lib/server/db/schema';
	import type { Weather } from '$lib/server/weather';
	import { updateLocation, type LocationUpdateError } from '$lib/location-update';

	let {
		location,
		weather
	}: {
		location: UserLocation;
		weather: Weather | null;
	} = $props();

	// Re-render local time every minute so the header stays current without
	// the user reloading. Kept simple: setInterval, untracked write.
	let now = $state(new Date());
	$effect(() => {
		const id = setInterval(() => (now = new Date()), 60_000);
		return () => clearInterval(id);
	});

	const timeFormatter = $derived(
		new Intl.DateTimeFormat('en-US', {
			hour: 'numeric',
			minute: '2-digit',
			timeZone: location.timezone ?? undefined
		})
	);

	const localTime = $derived(timeFormatter.format(now));

	let refreshing = $state(false);
	let refreshError = $state<string | null>(null);

	async function refresh() {
		refreshing = true;
		refreshError = null;
		try {
			await updateLocation();
		} catch (err) {
			refreshError = (err as LocationUpdateError).message ?? 'Could not update location.';
		} finally {
			refreshing = false;
		}
	}
</script>

<section class="border-border/60 mb-8 border-b pb-4">
	<div class="flex flex-wrap items-center gap-x-6 gap-y-2">
		<div class="flex items-center gap-2 text-lg font-medium">
			<MapPin class="size-5" />
			{location.city}
			<button
				type="button"
				onclick={refresh}
				disabled={refreshing}
				title="Update my location"
				aria-label="Update my location"
				class="text-muted-foreground hover:text-foreground -mr-1 ml-0.5 rounded p-1 transition-colors disabled:opacity-50"
			>
				{#if refreshing}
					<Loader2 class="size-3.5 animate-spin" />
				{:else}
					<RefreshCw class="size-3.5" />
				{/if}
			</button>
		</div>
		<div class="text-muted-foreground text-sm tabular-nums">{localTime}</div>
		{#if weather}
			<div class="text-muted-foreground flex items-center gap-1.5 text-sm">
				<span aria-hidden="true">{weather.icon}</span>
				<span>{weather.temperatureC}°C · {weather.description}</span>
			</div>
		{/if}
	</div>
	{#if refreshError}
		<p class="text-destructive mt-2 text-xs">{refreshError}</p>
	{/if}
</section>
