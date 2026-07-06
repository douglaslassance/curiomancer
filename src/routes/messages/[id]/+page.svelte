<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import AvatarMatch from '$lib/components/avatar-match.svelte';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Ban, MoreVertical, Reply, Send, SmilePlus, Trash2, X } from '@lucide/svelte';
	import { page } from '$app/state';
	import { createConversationStore } from '$lib/conversation.svelte';

	const REACTION_EMOJI = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

	let { data, form } = $props();
	const other = $derived(data.other);
	const signedInId = $derived(page.data.user?.id ?? null);

	let body = $state('');
	let formEl: HTMLFormElement | undefined = $state();
	let replyingTo = $state<{ id: string; body: string; senderId: string } | null>(null);

	const store = createConversationStore();
	$effect(() => {
		if (!data.unavailable) {
			store.hydrateFromServer(data.conversationId, other.id, data.messages, data.reactionsByMessage);
		}
	});
	onMount(() => {
		if (!data.unavailable) store.connect(data.conversationId);
	});
	onDestroy(() => store.disconnect());

	function onComposeInput() {
		store.sendTyping();
	}

	function scrollToMessage(id: string) {
		document.getElementById(`msg-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
	}

	async function react(messageId: string, emoji: string) {
		await fetch(`/api/messages/${messageId}/reactions`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ emoji })
		});
	}

	async function deleteConversation() {
		if (!confirm(`Delete your conversation with ${other.name}? This can't be undone.`)) return;
		try {
			const res = await fetch(`/api/conversations/${other.id}`, { method: 'DELETE' });
			if (!res.ok) throw new Error(await res.text().catch(() => `Status ${res.status}`));
			goto('/messages');
		} catch (err) {
			console.error('Delete conversation failed:', err);
		}
	}

	async function blockUser() {
		if (!confirm(`Block ${other.name}? Neither of you will see each other anymore.`)) return;
		try {
			const res = await fetch(`/api/block/${other.id}`, { method: 'POST' });
			if (!res.ok) throw new Error(await res.text().catch(() => `Status ${res.status}`));
			goto('/messages');
		} catch (err) {
			console.error('Block failed:', err);
		}
	}
</script>

<svelte:head>
	<title>{other.name} · Curiomancer</title>
</svelte:head>

<div class="flex h-full flex-col">
	<header class="mb-4 flex shrink-0 items-center gap-3">
		<a href={`/users/${other.id}`} aria-label={`${other.name}'s profile`}>
			<AvatarMatch name={other.name} image={other.image} score={data.score} size={40} />
		</a>
		<h1 class="flex-1 text-xl font-semibold tracking-tight">
			<a href={`/users/${other.id}`} class="hover:underline">{other.name}</a>
		</h1>
		<DropdownMenu.Root>
			<DropdownMenu.Trigger>
				{#snippet child({ props })}
					<button
						{...props}
						class="text-muted-foreground hover:bg-muted hover:text-foreground rounded-md p-1.5 focus-visible:outline-none"
						aria-label="Conversation options"
					>
						<MoreVertical class="size-4" />
					</button>
				{/snippet}
			</DropdownMenu.Trigger>
			<DropdownMenu.Content align="end" class="w-48">
				<DropdownMenu.Item onclick={deleteConversation}>
					<Trash2 class="size-4" />
					Delete conversation
				</DropdownMenu.Item>
				<DropdownMenu.Item variant="destructive" onclick={blockUser}>
					<Ban class="size-4" />
					Block
				</DropdownMenu.Item>
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	</header>

	{#if data.unavailable}
		<div class="text-muted-foreground rounded-xl border border-dashed py-12 text-center text-sm">
			{other.name} isn't accepting messages right now.
		</div>
	{:else}
		<div class="flex-1 space-y-2 overflow-y-auto">
			{#each store.messages as m (m.id)}
				{@const mine = m.senderId === signedInId}
				{@const reactions = store.reactionsFor(m.id)}
				<div class="group flex flex-col {mine ? 'items-end' : 'items-start'}">
					<div class="flex items-center gap-1 {mine ? 'flex-row-reverse' : ''}">
						<div
							id={`msg-${m.id}`}
							class="max-w-[75%] rounded-xl px-3 py-2 text-sm {mine
								? 'bg-primary text-primary-foreground'
								: 'bg-card border'}"
						>
							{#if m.replyTo}
								{@const replyTo = m.replyTo}
								<button
									type="button"
									onclick={() => scrollToMessage(replyTo.id)}
									class="mb-1 block border-l-2 pl-2 text-left text-xs opacity-70"
								>
									{replyTo.body.length > 80 ? replyTo.body.slice(0, 80) + '…' : replyTo.body}
								</button>
							{/if}
							{m.body}
						</div>
						<div class="flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
							<button
								type="button"
								onclick={() => (replyingTo = { id: m.id, body: m.body, senderId: m.senderId })}
								aria-label="Reply"
								class="text-muted-foreground hover:bg-muted hover:text-foreground rounded-md p-1"
							>
								<Reply class="size-3.5" />
							</button>
							<DropdownMenu.Root>
								<DropdownMenu.Trigger>
									{#snippet child({ props })}
										<button
											{...props}
											aria-label="React"
											class="text-muted-foreground hover:bg-muted hover:text-foreground rounded-md p-1"
										>
											<SmilePlus class="size-3.5" />
										</button>
									{/snippet}
								</DropdownMenu.Trigger>
								<DropdownMenu.Content class="flex w-auto gap-1 p-1">
									{#each REACTION_EMOJI as emoji (emoji)}
										<button
											type="button"
											onclick={() => react(m.id, emoji)}
											class="hover:bg-muted rounded p-1 text-base"
										>
											{emoji}
										</button>
									{/each}
								</DropdownMenu.Content>
							</DropdownMenu.Root>
						</div>
					</div>
					{#if reactions.length > 0}
						<div class="mt-1 flex flex-wrap gap-1">
							{#each reactions as r (r.emoji)}
								<Badge
									variant={r.userIds.includes(signedInId ?? '') ? 'secondary' : 'outline'}
									onclick={() => react(m.id, r.emoji)}
									class="cursor-pointer"
								>
									{r.emoji}
									{r.userIds.length}
								</Badge>
							{/each}
						</div>
					{/if}
				</div>
			{:else}
				<p class="text-muted-foreground py-8 text-center text-sm">
					Say hi to {other.name} - this is the start of your conversation.
				</p>
			{/each}
		</div>

		<div class="h-4 shrink-0">
			{#if store.isOtherTyping}
				<p class="text-muted-foreground text-xs">{other.name} is typing…</p>
			{/if}
		</div>

		{#if replyingTo}
			<div class="bg-muted mb-1 flex shrink-0 items-center justify-between rounded-md px-2 py-1 text-xs">
				<span class="truncate">
					Replying to {replyingTo.senderId === signedInId ? 'yourself' : other.name}: {replyingTo.body}
				</span>
				<button type="button" onclick={() => (replyingTo = null)} aria-label="Cancel reply">
					<X class="size-3" />
				</button>
			</div>
		{/if}

		<form
			bind:this={formEl}
			method="post"
			action="?/send"
			use:enhance={() => {
				return async ({ result, update }) => {
					await update();
					if (result.type === 'success') {
						body = '';
						replyingTo = null;
					}
				};
			}}
			class="mt-4 flex shrink-0 items-center gap-2"
		>
			<input type="hidden" name="replyToId" value={replyingTo?.id ?? ''} />
			<Input
				name="body"
				placeholder="Write a message…"
				autocomplete="off"
				bind:value={body}
				oninput={onComposeInput}
				class="flex-1"
			/>
			<Button type="submit" size="icon" disabled={!body.trim()}>
				<Send class="size-4" />
			</Button>
		</form>
		{#if form?.error}
			<p class="text-destructive mt-2 shrink-0 text-xs">{form.error}</p>
		{/if}
	{/if}
</div>
