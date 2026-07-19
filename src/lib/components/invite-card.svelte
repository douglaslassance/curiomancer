<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
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
		<form
			method="post"
			action="?/cancelInvite"
			use:enhance={({ cancel }) => {
				if (!confirm(`Cancel the invite to ${invite.invitedEmail ?? 'this person'}?`)) cancel();
			}}
		>
			<input type="hidden" name="id" value={invite.id} />
			<Button
				type="submit"
				size="sm"
				variant="ghost"
				class="text-muted-foreground hover:text-destructive"
				aria-label="Cancel invite"
			>
				<X class="size-4" />
			</Button>
		</form>
	{/if}
</article>
