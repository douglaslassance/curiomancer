<script lang="ts">
	import { enhance } from '$app/forms';
	import * as Card from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Button } from '$lib/components/ui/button';

	let { form } = $props();
</script>

<svelte:head>
	<title>Create your account - Curiomancer</title>
</svelte:head>

<div class="mx-auto max-w-sm py-10">
	<Card.Root>
		<Card.Header>
			<Card.Title>Create your account</Card.Title>
			<Card.Description>Join Curiomancer and start matching on taste.</Card.Description>
		</Card.Header>
		<Card.Content>
			<form method="post" class="space-y-4" use:enhance>
				<div class="space-y-2">
					<Label for="name">Name</Label>
					<Input
						id="name"
						name="name"
						type="text"
						placeholder="Jane Doe"
						value={form?.name ?? ''}
						required
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
				<Button type="submit" class="w-full">Create account</Button>
			</form>
		</Card.Content>
		<Card.Footer class="justify-center text-sm">
			<span class="text-muted-foreground">Already on Curiomancer?</span>
			<a href="/sign-in" class="ml-1 underline">Sign in</a>
		</Card.Footer>
	</Card.Root>
</div>
