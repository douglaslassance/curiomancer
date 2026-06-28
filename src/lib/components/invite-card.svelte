<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Check, Copy, Sparkles } from '@lucide/svelte';
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
		<code class="font-mono text-xs tracking-wide">{invite.id}</code>
		{#if redeemed}
			<p class="text-muted-foreground text-xs">
				Redeemed by {invite.redeemedByName ?? 'someone'}
			</p>
		{/if}
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
	{/if}
</article>
