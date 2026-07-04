<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import AvatarMatch from '$lib/components/avatar-match.svelte';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Ban, MoreVertical, Send, Trash2 } from '@lucide/svelte';
	import { page } from '$app/state';

	let { data, form } = $props();
	const other = $derived(data.other);
	const signedInId = $derived(page.data.user?.id ?? null);

	let body = $state('');
	let formEl: HTMLFormElement | undefined = $state();

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
			{#each data.messages as m (m.id)}
				{@const mine = m.senderId === signedInId}
				<div class="flex {mine ? 'justify-end' : 'justify-start'}">
					<div
						class="max-w-[75%] rounded-xl px-3 py-2 text-sm {mine
							? 'bg-primary text-primary-foreground'
							: 'bg-card border'}"
					>
						{m.body}
					</div>
				</div>
			{:else}
				<p class="text-muted-foreground py-8 text-center text-sm">
					Say hi to {other.name} - this is the start of your conversation.
				</p>
			{/each}
		</div>

		<form
			bind:this={formEl}
			method="post"
			action="?/send"
			use:enhance={() => {
				return async ({ result, update }) => {
					await update();
					if (result.type === 'success') body = '';
				};
			}}
			class="mt-4 flex shrink-0 items-center gap-2"
		>
			<Input
				name="body"
				placeholder="Write a message…"
				autocomplete="off"
				bind:value={body}
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
