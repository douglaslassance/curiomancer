<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import * as Card from '$lib/components/ui/card';

	let { form } = $props();

	let email = $state('');
	let subject = $state('');
	let message = $state('');
	let sending = $state(false);

	const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
	const isValid = $derived(
		email.trim() !== '' &&
			emailPattern.test(email) &&
			subject.trim() !== '' &&
			message.trim() !== ''
	);
</script>

<svelte:head>
	<title>Contact · Curiomancer</title>
</svelte:head>

<div class="mx-auto max-w-5xl">
	<Card.Root>
		<Card.Header>
			<Card.Title>Contact</Card.Title>
			<Card.Description>Questions, feedback, or bugs? Send us a note.</Card.Description>
		</Card.Header>
		<Card.Content>
			{#if form?.sent}
				<p class="text-sm text-emerald-600 dark:text-emerald-500">
					Message sent. We will get back to you soon.
				</p>
			{:else}
				<form
					class="space-y-4"
					method="POST"
					use:enhance={() => {
						sending = true;
						return async ({ update }) => {
							await update();
							sending = false;
						};
					}}
				>
					<div class="space-y-2">
						<Label for="email">Your email</Label>
						<Input
							id="email"
							name="email"
							type="email"
							placeholder="you@example.com"
							bind:value={email}
							required
						/>
					</div>
					<div class="space-y-2">
						<Label for="subject">Subject</Label>
						<Input id="subject" name="subject" bind:value={subject} required />
					</div>
					<div class="space-y-2">
						<Label for="message">Message</Label>
						<Textarea id="message" name="message" bind:value={message} required />
					</div>
					<!-- Honeypot: hidden from users, catches naive bots. -->
					<div class="hidden" aria-hidden="true">
						<label for="company">Company</label>
						<input id="company" name="company" type="text" tabindex="-1" autocomplete="off" />
					</div>
					{#if form?.error}
						<p class="text-destructive text-sm">{form.error}</p>
					{/if}
					<Button type="submit" class="w-full" disabled={!isValid || sending}>
						{sending ? 'Sending…' : 'Send message'}
					</Button>
				</form>
			{/if}
		</Card.Content>
	</Card.Root>
</div>
