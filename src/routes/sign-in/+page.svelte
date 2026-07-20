<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Card from '$lib/components/ui/card';
	import { Loader2 } from '@lucide/svelte';
	import { page } from '$app/state';

	let { form } = $props();
	const justReset = $derived(page.url.searchParams.get('reset') === '1');
	// Sign-in hits the network (and can redirect), so the button shows a spinner
	// instead of sitting there looking unresponsive.
	let submitting = $state(false);
</script>

<div class="mx-auto w-full max-w-md py-10">
	<Card.Root>
		<Card.Header>
			<Card.Title>Welcome back</Card.Title>
			<Card.Description>Sign in to sync your taste across devices.</Card.Description>
		</Card.Header>
		<Card.Content>
			{#if justReset}
				<p class="mb-4 text-sm text-emerald-600 dark:text-emerald-500">
					Password updated. Sign in with your new password.
				</p>
			{/if}
			<form
				method="post"
				class="space-y-4"
				use:enhance={() => {
					submitting = true;
					return async ({ update }) => {
						await update();
						submitting = false;
					};
				}}
			>
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
					<div class="flex items-center justify-between">
						<Label for="password">Password</Label>
						<a href="/forgot-password" class="text-muted-foreground text-xs underline">
							Forgot your password?
						</a>
					</div>
					<Input id="password" name="password" type="password" required />
				</div>
				{#if form?.message}
					<p class="text-destructive text-sm">{form.message}</p>
				{/if}
				<Button type="submit" class="w-full" disabled={submitting}>
					{#if submitting}
						<Loader2 class="size-4 animate-spin" />
						Signing in…
					{:else}
						Sign in
					{/if}
				</Button>
			</form>
		</Card.Content>
		<Card.Footer class="justify-center text-sm">
			<span class="text-muted-foreground">No account?</span>
			<a href="/sign-up" class="ml-1 underline">Sign up</a>
		</Card.Footer>
	</Card.Root>
</div>
