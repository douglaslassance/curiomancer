<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Card from '$lib/components/ui/card';
	import SubmitButton from '$lib/components/submit-button.svelte';
	import { pendingForm } from '$lib/pending-form.svelte';

	let { data, form } = $props();
	const save = pendingForm();
</script>

<div class="mx-auto max-w-sm py-10">
	<Card.Root>
		<Card.Header>
			<Card.Title>Set a new password</Card.Title>
			<Card.Description>Choose a new password for your account.</Card.Description>
		</Card.Header>
		<Card.Content>
			{#if data.invalid}
				<div class="space-y-3 text-sm">
					<p class="text-destructive">This reset link is invalid or has expired.</p>
					<Button href="/forgot-password" variant="outline" class="w-full">
						Request a new link
					</Button>
				</div>
			{:else}
				<form method="post" class="space-y-4" use:enhance={save.enhance}>
					<input type="hidden" name="token" value={data.token} />
					<div class="space-y-2">
						<Label for="newPassword">New password</Label>
						<Input
							id="newPassword"
							name="newPassword"
							type="password"
							placeholder="At least 8 characters"
							autocomplete="new-password"
							required
						/>
					</div>
					<div class="space-y-2">
						<Label for="confirm">Confirm password</Label>
						<Input
							id="confirm"
							name="confirm"
							type="password"
							autocomplete="new-password"
							required
						/>
					</div>
					{#if form?.message}
						<p class="text-destructive text-sm">{form.message}</p>
					{/if}
					<SubmitButton pending={save.submitting} pendingLabel="Updating…" class="w-full">
						Update password
					</SubmitButton>
				</form>
			{/if}
		</Card.Content>
	</Card.Root>
</div>
