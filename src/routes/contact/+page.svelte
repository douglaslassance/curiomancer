<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import * as Card from '$lib/components/ui/card';

	let { form } = $props();
	let sending = $state(false);
</script>

<svelte:head>
	<title>Contact · Curiomancer</title>
</svelte:head>

<div class="mx-auto max-w-5xl">
	<h1 class="text-3xl font-semibold tracking-tight">Contact</h1>
	<p class="text-muted-foreground mt-1 text-sm">Questions, feedback, or bugs? Send us a note.</p>

	<Card.Root class="mt-6">
		<Card.Content>
			{#if form?.success}
				<p class="text-sm text-emerald-600 dark:text-emerald-500">
					Message sent. We will get back to you soon.
				</p>
			{:else}
				<form
					method="post"
					class="space-y-4"
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
							value={form?.email ?? ''}
							required
						/>
					</div>
					<div class="space-y-2">
						<Label for="subject">Subject</Label>
						<Input id="subject" name="subject" value={form?.subject ?? ''} required />
					</div>
					<div class="space-y-2">
						<Label for="message">Message</Label>
						<Textarea id="message" name="message" value={form?.message ?? ''} required />
					</div>
					{#if form?.error}
						<p class="text-destructive text-sm">{form.error}</p>
					{/if}
					<Button type="submit" class="w-full" disabled={sending}>
						{sending ? 'Sending…' : 'Send message'}
					</Button>
				</form>
			{/if}
		</Card.Content>
	</Card.Root>
</div>
