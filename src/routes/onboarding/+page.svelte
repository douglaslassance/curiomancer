<script lang="ts">
	import { goto } from '$app/navigation';
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { ArrowRight, Download, Sparkles } from '@lucide/svelte';
	import GoogleImport from '$lib/components/google-import.svelte';

	let { data } = $props();

	// welcome: the intro pitch. import: the file wizard.
	let step = $state<'welcome' | 'import'>('welcome');
</script>

<svelte:head>
	<title>Welcome · Curiomancer</title>
</svelte:head>

{#if step === 'welcome'}
	<div class="mx-auto max-w-lg py-10">
		<Card.Root>
			<Card.Content class="flex flex-col items-center gap-6 py-10 text-center">
				<div class="bg-primary/10 flex size-14 items-center justify-center rounded-full">
					<Sparkles class="text-primary size-7" />
				</div>

				<div class="space-y-3">
					<h1 class="text-2xl font-semibold tracking-tight">
						Welcome to Curiomancer{data.firstName ? `, ${data.firstName}` : ''}
					</h1>
					<p class="text-muted-foreground text-balance">
						Curiomancer assesses your taste from how you rate places, which leads to better
						recommendations and more relevant twins.
					</p>
					<p class="text-muted-foreground text-balance">
						To accelerate that, we recommend importing your favorites and "want to go" from Google
						Maps.
					</p>
				</div>

				<div class="flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
					<Button size="lg" onclick={() => (step = 'import')}>
						<Download class="size-4" />
						Import from Google Maps
						<ArrowRight class="size-4" />
					</Button>
					<Button size="lg" variant="ghost" onclick={() => goto('/')}>Skip, go to dashboard</Button>
				</div>
			</Card.Content>
		</Card.Root>
	</div>
{:else}
	<div class="py-4">
		<GoogleImport />
	</div>
{/if}
