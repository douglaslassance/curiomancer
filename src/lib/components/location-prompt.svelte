<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { updateLocation, type LocationUpdateError } from '$lib/location-update';
	import { Compass, Loader2 } from '@lucide/svelte';
	import { onMount } from 'svelte';

	let status = $state<'idle' | 'working' | 'error'>('idle');
	let errorMessage = $state<string | null>(null);
	let errorHint = $state<string | null>(null);

	async function run() {
		errorMessage = null;
		errorHint = null;
		status = 'working';
		try {
			await updateLocation();
		} catch (err) {
			const e = err as LocationUpdateError;
			console.error('Geolocation failed:', err);
			status = 'error';
			errorMessage = e.message ?? 'Something went wrong.';
			errorHint = e.hint ?? null;
		}
	}

	// Auto-prompt on mount: location is the whole point of the dashboard, so
	// don't make the user click twice. The browser still shows its own
	// permission dialog, and the in-page button stays available as a retry.
	onMount(() => {
		void run();
	});
</script>

<div class="bg-card mx-auto max-w-md rounded-xl border p-8 text-center">
	<Compass class="text-primary mx-auto size-8" />
	<h2 class="mt-4 text-lg font-medium">Where are you right now?</h2>
	<p class="text-muted-foreground mt-2 text-sm">
		Curiomancer surfaces places and people in your current city. We need to know where you are.
	</p>
	<Button onclick={run} disabled={status === 'working'} class="mt-6">
		{#if status === 'working'}
			<Loader2 class="size-4 animate-spin" />
			Locating…
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
