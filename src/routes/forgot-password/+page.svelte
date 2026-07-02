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
			<Card.Title>Reset your password</Card.Title>
			<Card.Description>
				Enter your email and we'll send a link to set a new password.
			</Card.Description>
		</Card.Header>
		<Card.Content>
			{#if form?.sent}
				<div class="space-y-2 text-sm">
					<p>
						If an account exists for <span class="font-medium">{form.email}</span>, a reset link is
						on its way.
					</p>
					<p class="text-muted-foreground">Check your inbox and follow the link to continue.</p>
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
					{#if form?.message}
						<p class="text-destructive text-sm">{form.message}</p>
					{/if}
					<Button type="submit" class="w-full">Send reset link</Button>
				</form>
			{/if}
		</Card.Content>
		<Card.Footer class="justify-center text-sm">
			<a href="/sign-in" class="underline">Back to sign in</a>
		</Card.Footer>
	</Card.Root>
</div>
