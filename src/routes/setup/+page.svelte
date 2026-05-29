<script lang="ts">
	import { enhance } from '$app/forms';
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Shield } from '@lucide/svelte';

	let { form } = $props();
</script>

<svelte:head>
	<title>Set up Bond</title>
</svelte:head>

<div class="mx-auto max-w-sm py-10">
	<Card.Root>
		<Card.Header>
			<Card.Title class="flex items-center gap-2">
				<Shield class="text-primary size-5" />
				Set up Bond
			</Card.Title>
			<Card.Description>
				First-time setup. The account you create here becomes the platform admin. This page
				disappears once your account exists.
			</Card.Description>
		</Card.Header>
		<Card.Content>
			<form method="post" class="space-y-4" use:enhance>
				<div class="space-y-2">
					<Label for="name">Name</Label>
					<Input
						id="name"
						name="name"
						type="text"
						placeholder="Your name"
						value={form?.name ?? ''}
						required
						autofocus
					/>
				</div>
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
					<Label for="password">Password</Label>
					<Input id="password" name="password" type="password" required minlength={8} />
				</div>
				{#if form?.message}
					<p class="text-destructive text-sm">{form.message}</p>
				{/if}
				<Button type="submit" class="w-full">Create admin account</Button>
			</form>
		</Card.Content>
	</Card.Root>
</div>
