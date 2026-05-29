<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Card from '$lib/components/ui/card';
	import { Shield, Sparkles } from '@lucide/svelte';

	let { data, form } = $props();
</script>

<div class="mx-auto max-w-sm py-10">
	<Card.Root>
		<Card.Header>
			<Card.Title>
				{data.bootstrapMode ? 'Set up Bond' : 'Create your account'}
			</Card.Title>
			<Card.Description>
				{#if data.bootstrapMode}
					<span class="flex items-center gap-1.5">
						<Shield class="text-primary size-4" />
						First time here. The account you create will be the admin.
					</span>
				{:else if data.inviteState === 'valid' && data.inviter}
					<span class="flex items-center gap-1.5">
						<Sparkles class="text-primary size-4" />
						{data.inviter.name} is inviting you to Bond.
					</span>
				{:else if data.inviteState === 'invalid'}
					That invite code is invalid or already used.
				{:else}
					Bond is invite-only. Paste your code below.
				{/if}
			</Card.Description>
		</Card.Header>
		<Card.Content>
			<form method="post" class="space-y-4" use:enhance>
				<input type="hidden" name="invite" value={data.code ?? ''} />
				{#if !data.bootstrapMode && data.inviteState !== 'valid'}
					<div class="space-y-2">
						<Label for="invite-input">Invite code</Label>
						<Input
							id="invite-input"
							name="invite"
							type="text"
							placeholder="ABCD-EFGH-IJKL"
							value={data.code ?? ''}
							autocomplete="off"
							class="font-mono uppercase"
						/>
					</div>
				{/if}
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
				<Button type="submit" class="w-full">
					{data.bootstrapMode ? 'Set up account' : 'Create account'}
				</Button>
			</form>
		</Card.Content>
		<Card.Footer class="justify-center text-sm">
			<span class="text-muted-foreground">Already on Bond?</span>
			<a href="/sign-in" class="ml-1 underline">Sign in</a>
		</Card.Footer>
	</Card.Root>
</div>
