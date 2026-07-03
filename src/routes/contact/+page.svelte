<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import * as Card from '$lib/components/ui/card';

	const FORMSPREE_ENDPOINT = 'https://formspree.io/f/xbddrwbe';

	let email = $state('');
	let subject = $state('');
	let message = $state('');
	let status = $state<'idle' | 'sending' | 'sent' | 'error'>('idle');

	const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
	const isValid = $derived(
		email.trim() !== '' &&
			emailPattern.test(email) &&
			subject.trim() !== '' &&
			message.trim() !== ''
	);

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		if (!isValid || status === 'sending') return;

		status = 'sending';
		try {
			const res = await fetch(FORMSPREE_ENDPOINT, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
				body: JSON.stringify({ email, subject: `[Curiomancer] ${subject}`, message })
			});
			status = res.ok ? 'sent' : 'error';
		} catch {
			status = 'error';
		}
	}
</script>

<svelte:head>
	<title>Contact · Curiomancer</title>
</svelte:head>

<div class="mx-auto max-w-sm">
	<Card.Root>
		<Card.Header>
			<Card.Title>Contact</Card.Title>
			<Card.Description>Questions, feedback, or bugs - send us a note.</Card.Description>
		</Card.Header>
		<Card.Content>
			{#if status === 'sent'}
				<p class="text-sm text-emerald-600 dark:text-emerald-500">
					Message sent. We will get back to you soon.
				</p>
			{:else}
				<form class="space-y-4" onsubmit={submit}>
					<div class="space-y-2">
						<Label for="email">Your email</Label>
						<Input
							id="email"
							type="email"
							placeholder="you@example.com"
							bind:value={email}
							required
						/>
					</div>
					<div class="space-y-2">
						<Label for="subject">Subject</Label>
						<Input id="subject" bind:value={subject} required />
					</div>
					<div class="space-y-2">
						<Label for="message">Message</Label>
						<Textarea id="message" bind:value={message} required />
					</div>
					{#if status === 'error'}
						<p class="text-destructive text-sm">
							Something went wrong sending your message. Try again, or email us directly at <a
								href="mailto:hey@douglaslassance.me"
								class="underline">hey@douglaslassance.me</a
							>.
						</p>
					{/if}
					<Button type="submit" class="w-full" disabled={!isValid || status === 'sending'}>
						{status === 'sending' ? 'Sending…' : 'Send message'}
					</Button>
				</form>
			{/if}
		</Card.Content>
	</Card.Root>
</div>
