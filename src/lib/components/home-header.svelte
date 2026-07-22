<script lang="ts">
	import {
		Cloud,
		CloudDrizzle,
		CloudFog,
		CloudLightning,
		CloudRain,
		CloudSnow,
		CloudSun,
		Loader2,
		MapPin,
		RefreshCw,
		Sun
	} from '@lucide/svelte';
	import type { Component } from 'svelte';
	import type { CurrentLocation } from '$lib/server/current-location';
	import type { Weather } from '$lib/server/weather';
	import { updateLocation, type LocationUpdateError } from '$lib/location-update';

	// Lucide icon for a WMO weather code (mirrors describeCode in weather.ts).
	function weatherIcon(code: number): Component {
		if (code === 0) return Sun;
		if (code <= 2) return CloudSun;
		if (code === 3) return Cloud;
		if (code >= 45 && code <= 48) return CloudFog;
		if (code >= 51 && code <= 57) return CloudDrizzle;
		if (code >= 61 && code <= 67) return CloudRain;
		if (code >= 71 && code <= 77) return CloudSnow;
		if (code >= 80 && code <= 82) return CloudRain;
		if (code >= 95) return CloudLightning;
		return CloudSun;
	}

	let {
		location,
		weather
	}: {
		location: CurrentLocation;
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
			{@const WeatherIcon = weatherIcon(weather.weatherCode)}
			<div class="text-muted-foreground flex items-center gap-1.5 text-sm">
				<WeatherIcon class="size-4" />
				<span>{weather.temperatureC}°C · {weather.description}</span>
			</div>
		{/if}
	</div>
	{#if refreshError}
		<p class="text-destructive mt-2 text-xs">{refreshError}</p>
	{/if}
</section>
