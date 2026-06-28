<script lang="ts">
	import { enhance } from '$app/forms';
	import * as Card from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Button } from '$lib/components/ui/button';
	import { Check } from '@lucide/svelte';

	let { form } = $props();
</script>

<svelte:head>
	<title>Join the waitlist - Curiomancer</title>
</svelte:head>

<div class="mx-auto max-w-sm py-10">
	<Card.Root>
		<Card.Header>
			<Card.Title>Join the waitlist</Card.Title>
			<Card.Description>
				Curiomancer is invite-only while we build density city by city. Leave your email and we'll
				bring you in when your area is ready.
			</Card.Description>
		</Card.Header>
		<Card.Content>
			{#if form?.joined}
				<div class="flex items-start gap-2 text-sm">
					<Check class="text-primary mt-0.5 size-4 shrink-0" />
					<p>You're on the list. We'll email you an invite when it's your turn.</p>
				</div>
			{:else}
				<form method="post" class="space-y-4" use:enhance>
					<div class="space-y-2">
						<Label for="email">Email</Label>
						<Input
							id="email"
							name="email"
							type="email"
							placeholder="you@example.com"
							value={form?.email ?? ''}
							required
						/>
					</div>
					<div class="space-y-2">
						<Label for="city">Home city <span class="text-muted-foreground">(optional)</span></Label>
						<Input
							id="city"
							name="city"
							type="text"
							placeholder="Los Angeles"
							value={form?.city ?? ''}
							autocomplete="off"
						/>
						<p class="text-muted-foreground text-xs">
							Helps us know where to open up next.
						</p>
					</div>
					{#if form?.message}
						<p class="text-destructive text-sm">{form.message}</p>
					{/if}
					<Button type="submit" class="w-full">Join the waitlist</Button>
				</form>
			{/if}
		</Card.Content>
		<Card.Footer class="justify-center text-sm">
			<span class="text-muted-foreground">Already have an invite?</span>
			<a href="/sign-in" class="ml-1 underline">Sign in</a>
		</Card.Footer>
	</Card.Root>
</div>
