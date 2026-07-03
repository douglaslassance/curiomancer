<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { ArrowRight, Check, MessageCircle, Sparkles, Users } from '@lucide/svelte';
	import { page } from '$app/state';

	const signedIn = $derived(!!page.data.user);

	// Stripe checkout is not wired yet - clicking surfaces an inline note
	// instead of a dead button. Swap this for a POST to a checkout-session
	// endpoint once billing is live.
	let checkoutNote = $state(false);

	const perks = [
		'Message your taste-twins directly',
		'Trade the spots that never make a public list',
		'Priority access to new cities and features'
	];
</script>

<svelte:head>
	<title>Curiomancer Pro</title>
</svelte:head>

<div class="mx-auto max-w-5xl py-10">
	<div class="text-center">
		<span
			class="bg-primary text-primary-foreground mb-3 inline-block rounded-full px-2 py-0.5 text-xs font-medium"
		>
			Pro
		</span>
		<h1 class="text-3xl font-semibold tracking-tight">Expand your network</h1>
		<p class="text-muted-foreground mx-auto mt-3 max-w-md text-balance">
			Curiomancer is free for discovering places and people. Go Pro to reach your taste-twins.
		</p>
	</div>

	<div class="bg-card mt-8 rounded-xl border p-6">
		<div class="flex items-baseline gap-1">
			<span class="text-3xl font-semibold tabular-nums">$4.99</span>
			<span class="text-muted-foreground text-sm">/ month</span>
		</div>

		<ul class="mt-5 space-y-3">
			{#each perks as perk (perk)}
				<li class="flex items-start gap-2 text-sm">
					<Check class="text-primary mt-0.5 size-4 shrink-0" />
					<span>{perk}</span>
				</li>
			{/each}
		</ul>

		<div class="mt-6">
			{#if signedIn}
				<Button class="w-full" onclick={() => (checkoutNote = true)}>
					Subscribe for $4.99/month
					<ArrowRight class="size-4" />
				</Button>
				{#if checkoutNote}
					<p class="text-muted-foreground mt-3 text-center text-xs">
						Checkout is being set up. Hang tight.
					</p>
				{/if}
			{:else}
				<Button class="w-full" href="/sign-up?next=/pro">
					Create an account to subscribe
					<ArrowRight class="size-4" />
				</Button>
			{/if}
		</div>
	</div>

	<div class="text-muted-foreground mt-8 grid gap-4 sm:grid-cols-3">
		<div class="flex flex-col items-center gap-1.5 text-center text-xs">
			<MessageCircle class="size-5" />
			<span>Direct messages</span>
		</div>
		<div class="flex flex-col items-center gap-1.5 text-center text-xs">
			<Users class="size-5" />
			<span>Build your circle</span>
		</div>
		<div class="flex flex-col items-center gap-1.5 text-center text-xs">
			<Sparkles class="size-5" />
			<span>Early features</span>
		</div>
	</div>
</div>
