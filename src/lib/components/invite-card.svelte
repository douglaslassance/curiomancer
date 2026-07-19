<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import ConfirmDeleteButton from '$lib/components/confirm-delete-button.svelte';
	import { Check, Copy, Sparkles, X } from '@lucide/svelte';
	import type { InviteWithRedeemer } from '$lib/server/invites';
	import { page } from '$app/state';

	let { invite }: { invite: InviteWithRedeemer } = $props();

	let copied = $state(false);
	let copyTimeout: ReturnType<typeof setTimeout> | null = null;

	const link = $derived(`${page.url.origin}/sign-up?invite=${invite.id}`);
	const redeemed = $derived(invite.redeemedByUserId !== null);

	async function copy() {
		try {
			await navigator.clipboard.writeText(link);
			copied = true;
			if (copyTimeout) clearTimeout(copyTimeout);
			copyTimeout = setTimeout(() => (copied = false), 1500);
		} catch (err) {
			console.error('Clipboard write failed:', err);
		}
	}
</script>

<article
	class="bg-card flex items-center gap-3 rounded-lg border p-3 transition-colors"
	class:opacity-60={redeemed}
>
	<Sparkles class="text-primary size-4 shrink-0" />
	<div class="min-w-0 flex-1">
		<p class="truncate text-sm">{invite.invitedEmail ?? invite.id}</p>
		<p class="text-muted-foreground text-xs">
			{#if redeemed}
				Joined{invite.redeemedByName ? ` · ${invite.redeemedByName}` : ''}
			{:else}
				Pending
			{/if}
		</p>
	</div>
	{#if !redeemed}
		<Button size="sm" variant="outline" onclick={copy} aria-label="Copy invite link">
			{#if copied}
				<Check class="size-4" />
				Copied
			{:else}
				<Copy class="size-4" />
				Copy link
			{/if}
		</Button>
		<ConfirmDeleteButton
			action="?/cancelInvite"
			value={invite.id}
			label="Cancel invite"
			class="text-muted-foreground hover:text-destructive"
		>
			{#snippet icon()}
				<X class="size-4" />
			{/snippet}
		</ConfirmDeleteButton>
	{/if}
</article>
