<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Card from '$lib/components/ui/card';

	let { form } = $props();
</script>

<div class="mx-auto max-w-sm py-10">
	<Card.Root>
		<Card.Header>
			<Card.Title>Create your account</Card.Title>
			<Card.Description>Start liking places to build your taste profile.</Card.Description>
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
			<span class="text-muted-foreground">Already on Bond?</span>
			<a href="/sign-in" class="ml-1 underline">Sign in</a>
		</Card.Footer>
	</Card.Root>
</div>
