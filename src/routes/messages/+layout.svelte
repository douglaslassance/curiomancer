<script lang="ts">
	import { page } from '$app/state';
	import * as Avatar from '$lib/components/ui/avatar';
	import { Input } from '$lib/components/ui/input';
	import { MessageCircle, Search } from '@lucide/svelte';

	let { data, children } = $props();

	const activeId = $derived(page.params.id ?? null);

	let query = $state('');
	const filteredConversations = $derived.by(() => {
		const q = query.trim().toLowerCase();
		if (!q) return data.conversations;
		return data.conversations.filter((c) => c.otherUser.name.toLowerCase().includes(q));
	});

	function preview(body: string): string {
		return body.length > 60 ? `${body.slice(0, 60)}…` : body;
	}
</script>

<svelte:head>
	<title>Curiomancer</title>
</svelte:head>

<!--
  Explicit calc rather than h-full: h-full needs every ancestor up to <main>
  to have a definite (non-auto) resolved height for the percentage to
  propagate, which flex-grow doesn't reliably give here. Chrome above/below
  this panel is fixed - header (3.5rem) + <main>'s vertical padding (4rem) +
  the footer (~4.5rem) - so this fills the rest without an outer-page scroll.
-->
<div class="flex h-[calc(100vh-12rem)] min-h-[420px] gap-0 overflow-hidden rounded-xl border">
	<aside class="flex w-64 shrink-0 flex-col border-r sm:w-72">
		<div class="shrink-0 border-b p-2.5">
			<div class="relative">
				<Search class="text-muted-foreground absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2" />
				<Input
					type="search"
					placeholder="Search conversations…"
					value={query}
					oninput={(e) => (query = e.currentTarget.value)}
					class="h-8 pl-8 text-sm"
				/>
			</div>
		</div>

		<div class="flex-1 overflow-y-auto">
			{#if data.conversations.length === 0}
				<div class="text-muted-foreground p-4 text-center text-sm">
					<MessageCircle class="mx-auto size-6 opacity-60" />
					<p class="mt-2">No conversations yet.</p>
				</div>
			{:else if filteredConversations.length === 0}
				<p class="text-muted-foreground p-4 text-center text-sm">No matches for "{query}".</p>
			{:else}
				<div class="divide-y">
					{#each filteredConversations as c (c.conversationId)}
						<a
							href={`/messages/${c.otherUser.id}`}
							class="hover:bg-accent flex items-center gap-3 p-3 transition-colors {activeId ===
							c.otherUser.id
								? 'bg-accent'
								: ''}"
						>
							<Avatar.Root class="size-9">
								{#if c.otherUser.image}
									<Avatar.Image src={c.otherUser.image} alt={c.otherUser.name} />
								{/if}
								<Avatar.Fallback class="text-xs font-medium">
									{c.otherUser.name.slice(0, 1).toUpperCase()}
								</Avatar.Fallback>
							</Avatar.Root>
							<div class="min-w-0 flex-1">
								<div class="truncate text-sm font-medium">{c.otherUser.name}</div>
								<div class="text-muted-foreground truncate text-xs">
									{c.lastMessage ? preview(c.lastMessage.body) : 'No messages yet.'}
								</div>
							</div>
						</a>
					{/each}
				</div>
			{/if}
		</div>
	</aside>

	<div class="flex min-w-0 flex-1 flex-col p-4">
		{@render children()}
	</div>
</div>
