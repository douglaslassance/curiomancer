<script lang="ts">
	import { enhance, applyAction } from '$app/forms';
	import { page } from '$app/state';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { ArrowRight, Heart, Loader2, MessageCircle, Ticket } from '@lucide/svelte';
	import { PLAN_NAME } from '$lib/subscription';
	import type { SubmitFunction } from '@sveltejs/kit';

	let { form } = $props();

	const signedIn = $derived(!!page.data.user);
	const isSubscriber = $derived(!!page.data.isSubscriber);
	const checkoutState = $derived(page.url.searchParams.get('checkout'));

	let checkoutLoading = $state(false);

	// Checkout redirects to a Stripe-hosted page; goto() can't leave the app, so
	// follow the external redirect with a full navigation. Managing an existing
	// subscription lives in Settings, not here.
	const startCheckout: SubmitFunction = () => {
		checkoutLoading = true;
		return async ({ result }) => {
			if (result.type === 'redirect') {
				window.location.href = result.location;
				return;
			}
			checkoutLoading = false;
			await applyAction(result);
		};
	};

	const benefits = [
		{ icon: MessageCircle, label: 'Message your twins' },
		{ icon: Ticket, label: 'Get priority access to events' },
		{ icon: Heart, label: 'Support the platform' }
	];
</script>

<svelte:head>
	<title>Curiomancer {PLAN_NAME}</title>
</svelte:head>

<div class="mx-auto max-w-5xl py-10">
	<div class="text-center">
		<h1 class="text-3xl font-semibold tracking-tight">Upgrade to {PLAN_NAME}</h1>
		<p class="text-muted-foreground mx-auto mt-3 max-w-md text-balance">
			Curiomancer is free to explore. Go {PLAN_NAME} to connect with your taste-twins and help keep
			the platform going.
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
				{#if isSubscriber}
					<Button class="w-full" href="/messages">
						Go to your messages
						<ArrowRight class="size-4" />
					</Button>
				{:else if signedIn}
					<form method="post" action="?/checkout" use:enhance={startCheckout}>
						<Button type="submit" class="w-full" disabled={checkoutLoading}>
							{#if checkoutLoading}
								<Loader2 class="size-4 animate-spin" />
								Redirecting…
							{:else}
								Get {PLAN_NAME} for $4.99/month
								<ArrowRight class="size-4" />
							{/if}
						</Button>
					</form>
				{:else}
					<Button class="w-full" href="/sign-up?next=/subscribe">
						Create an account to get {PLAN_NAME}
						<ArrowRight class="size-4" />
					</Button>
				{/if}

				{#if checkoutState === 'success' && !isSubscriber}
					<p class="text-muted-foreground mt-3 text-center text-xs">
						Payment received. Activating {PLAN_NAME}…
					</p>
				{:else if checkoutState === 'canceled'}
					<p class="text-muted-foreground mt-3 text-center text-xs">
						Checkout canceled. You can go {PLAN_NAME} whenever you're ready.
					</p>
				{/if}

				{#if form?.message}
					<p class="text-destructive mt-3 text-center text-xs">{form.message}</p>
				{/if}
			</div>
		</Card.Content>
	</Card.Root>
</div>
