<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { invalidateAll } from '$app/navigation';
	import { Compass, Loader2 } from '@lucide/svelte';
	import { onMount } from 'svelte';

	let status = $state<'idle' | 'asking' | 'resolving' | 'error'>('idle');
	let errorMessage = $state<string | null>(null);
	let errorHint = $state<string | null>(null);

	async function requestLocation() {
		errorMessage = null;
		errorHint = null;

		if (typeof navigator === 'undefined' || !navigator.geolocation) {
			status = 'error';
			errorMessage = 'Your browser does not support geolocation.';
			return;
		}

		status = 'asking';
		try {
			const position = await new Promise<GeolocationPosition>((resolve, reject) => {
				navigator.geolocation.getCurrentPosition(resolve, reject, {
					// false = let the browser use coarse wifi/IP positioning, which is
					// faster and usually accurate enough at city granularity. Avoids
					// long waits for GPS lock on desktop.
					enableHighAccuracy: false,
					timeout: 20_000,
					maximumAge: 5 * 60_000
				});
			});

			status = 'resolving';
			const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
			const res = await fetch('/api/location', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					latitude: position.coords.latitude,
					longitude: position.coords.longitude,
					timezone
				})
			});
			if (!res.ok) {
				const text = await res.text().catch(() => '');
				throw new Error(text || `Server returned ${res.status}`);
			}
			await invalidateAll();
		} catch (err) {
			console.error('Geolocation failed:', err);
			status = 'error';

			if (err instanceof GeolocationPositionError) {
				switch (err.code) {
					case err.PERMISSION_DENIED:
						errorMessage = 'Location permission was denied.';
						errorHint =
							'Allow location for this site in your browser, then try again.';
						break;
					case err.POSITION_UNAVAILABLE:
						errorMessage = 'Your device could not determine its location.';
						errorHint =
							'On macOS, check System Settings → Privacy & Security → Location Services and make sure your browser is allowed.';
						break;
					case err.TIMEOUT:
						errorMessage = 'Timed out waiting for your location.';
						errorHint = 'Try again — sometimes the first attempt takes a moment.';
						break;
					default:
						errorMessage = `Geolocation error (code ${err.code}).`;
				}
			} else if (err instanceof Error) {
				errorMessage = err.message;
			} else {
				errorMessage = 'Something went wrong.';
			}
		}
	}

	// Auto-prompt on mount: location is the whole point of the dashboard, so
	// don't make the user click twice. The browser still shows its own
	// permission dialog, and the in-page button stays available as a retry.
	onMount(() => {
		void requestLocation();
	});
</script>

<div class="bg-card mx-auto max-w-md rounded-xl border p-8 text-center">
	<Compass class="text-primary mx-auto size-8" />
	<h2 class="mt-4 text-lg font-medium">Where are you right now?</h2>
	<p class="text-muted-foreground mt-2 text-sm">
		Bond surfaces places and people in your current city. We need to know where you are.
	</p>
	<Button
		onclick={requestLocation}
		disabled={status === 'asking' || status === 'resolving'}
		class="mt-6"
	>
		{#if status === 'asking' || status === 'resolving'}
			<Loader2 class="size-4 animate-spin" />
			{status === 'asking' ? 'Asking your browser…' : 'Resolving city…'}
		{:else if status === 'error'}
			Try again
		{:else}
			Use my location
		{/if}
	</Button>
	{#if errorMessage}
		<p class="text-destructive mt-4 text-sm">{errorMessage}</p>
		{#if errorHint}
			<p class="text-muted-foreground mt-1 text-xs">{errorHint}</p>
		{/if}
	{/if}
</div>
