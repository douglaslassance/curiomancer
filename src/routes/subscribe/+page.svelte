<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { ArrowRight, Heart, MessageCircle, Ticket } from '@lucide/svelte';
	import { page } from '$app/state';

	const signedIn = $derived(!!page.data.user);

	// Stripe checkout is not wired yet - clicking surfaces an inline note
	// instead of a dead button. Swap this for a POST to a checkout-session
	// endpoint once billing is live.
	let checkoutNote = $state(false);

	const benefits = [
		{ icon: MessageCircle, label: 'Message your twins' },
		{ icon: Ticket, label: 'Get priority access to events' },
		{ icon: Heart, label: 'Support the platform' }
	];
</script>

<svelte:head>
	<title>Subscribe to Curiomancer</title>
</svelte:head>

<div class="mx-auto max-w-5xl py-10">
	<div class="text-center">
		<h1 class="text-3xl font-semibold tracking-tight">Become a subscriber</h1>
		<p class="text-muted-foreground mx-auto mt-3 max-w-md text-balance">
			Curiomancer is free to explore. Subscribe to connect with your taste-twins and help keep the
			platform going.
		</p>
	</div>

	<Card.Root class="mt-8">
		<Card.Content>
			<div class="flex items-baseline gap-1">
				<span class="text-3xl font-semibold tabular-nums">$4.99</span>
				<span class="text-muted-foreground text-sm">/ month</span>
			</div>

			<ul class="mt-5 space-y-3">
				{#each benefits as benefit (benefit.label)}
					{@const Icon = benefit.icon}
					<li class="flex items-start gap-2 text-sm">
						<Icon class="text-primary mt-0.5 size-4 shrink-0" />
						<span>{benefit.label}</span>
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
					<Button class="w-full" href="/sign-up?next=/subscribe">
						Create an account to subscribe
						<ArrowRight class="size-4" />
					</Button>
				{/if}
			</div>
		</Card.Content>
	</Card.Root>
</div>
