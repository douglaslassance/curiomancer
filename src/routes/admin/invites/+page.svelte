<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { Input } from '$lib/components/ui/input';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Copy, Loader2, Plus, Search, Trash2, X } from '@lucide/svelte';

	let { data } = $props();

	// --- Add-invite dialog: search a user to own the new invite -----------------
	type OwnerHit = { id: string; name: string | null; email: string };
	let createOpen = $state(false);
	let ownerQuery = $state('');
	let ownerResults = $state<OwnerHit[]>([]);
	let searching = $state(false);
	let searchSeq = 0;

	async function searchOwners(q: string) {
		const trimmed = q.trim();
		if (!trimmed) {
			ownerResults = [];
			searching = false;
			return;
		}
		const seq = ++searchSeq;
		searching = true;
		try {
			const res = await fetch(`/admin/invites/search?q=${encodeURIComponent(trimmed)}`);
			const body = (await res.json()) as { users: OwnerHit[] };
			if (seq === searchSeq) ownerResults = body.users;
		} catch (err) {
			console.error('Owner search failed:', err);
			if (seq === searchSeq) ownerResults = [];
		} finally {
			if (seq === searchSeq) searching = false;
		}
	}

	let searchTimer: ReturnType<typeof setTimeout> | undefined;
	function onOwnerQuery(value: string) {
		ownerQuery = value;
		clearTimeout(searchTimer);
		searchTimer = setTimeout(() => searchOwners(value), 200);
	}

	// Reset the picker each time the dialog opens.
	$effect(() => {
		if (createOpen) {
			ownerQuery = '';
			ownerResults = [];
			searching = false;
		}
	});

	// Close the dialog once a create action lands.
	const onCreated = () => {
		return async ({ update }: { update: () => Promise<void> }) => {
			await update();
			createOpen = false;
		};
	};

	const dateFmt = new Intl.DateTimeFormat('en-US', {
		year: 'numeric',
		month: 'short',
		day: 'numeric'
	});

	const redeemedCount = $derived(data.invites.filter((i) => i.redeemedByUserId).length);

	function signupLink(code: string): string {
		return `${page.url.origin}/sign-up?invite=${code}`;
	}

	let copied = $state<string | null>(null);
	async function copyLink(code: string) {
		try {
			await navigator.clipboard.writeText(signupLink(code));
			copied = code;
			setTimeout(() => (copied = null), 2000);
		} catch (err) {
			console.error('Clipboard write failed:', err);
		}
	}

	let query = $state('');
	const filteredInvites = $derived.by(() => {
		const q = query.trim().toLowerCase();
		if (!q) return data.invites;
		return data.invites.filter(
			(i) =>
				i.id.toLowerCase().includes(q) ||
				(i.ownerName ?? '').toLowerCase().includes(q) ||
				(i.creatorName ?? '').toLowerCase().includes(q) ||
				(i.intendedForEmail ?? '').toLowerCase().includes(q) ||
				(i.redeemedByName ?? '').toLowerCase().includes(q)
		);
	});
</script>

<svelte:head>
	<title>Admin · Invites · Curiomancer</title>
</svelte:head>

<div class="mb-4 flex flex-wrap items-center justify-between gap-3">
	<p class="text-muted-foreground text-sm">
		{data.invites.length} total · {redeemedCount} redeemed
	</p>
	<Button size="sm" onclick={() => (createOpen = true)}>
		<Plus class="size-4" />
		Add invite
	</Button>
</div>

<Dialog.Root bind:open={createOpen}>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>Add invite</Dialog.Title>
			<Dialog.Description>Choose who owns the new invite.</Dialog.Description>
		</Dialog.Header>

		<div class="relative">
			<Search class="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
			<Input
				placeholder="Search a user by name or email…"
				value={ownerQuery}
				oninput={(e) => onOwnerQuery(e.currentTarget.value)}
				class="pl-9"
			/>
		</div>

		<div class="max-h-72 overflow-y-auto rounded-md border">
			<!-- Default: unowned platform invite (won't clutter anyone's Settings). -->
			<form method="post" action="?/create" use:enhance={onCreated}>
				<input type="hidden" name="ownerId" value="" />
				<button
					type="submit"
					class="hover:bg-accent flex w-full items-center gap-2 border-b px-3 py-2 text-left text-sm"
				>
					<Plus class="text-muted-foreground size-4" />
					<span class="font-medium">No owner</span>
					<span class="text-muted-foreground text-xs">platform invite</span>
				</button>
			</form>

			<!-- Shortcut to own it yourself. -->
			{#if data.self}
				<form method="post" action="?/create" use:enhance={onCreated}>
					<input type="hidden" name="ownerId" value={data.self.id} />
					<button
						type="submit"
						class="hover:bg-accent flex w-full items-center gap-2 border-b px-3 py-2 text-left text-sm"
					>
						<span class="font-medium">Yourself</span>
						<span class="text-muted-foreground text-xs">{data.self.name}</span>
					</button>
				</form>
			{/if}

			{#if searching}
				<div class="text-muted-foreground flex items-center gap-2 px-3 py-3 text-sm">
					<Loader2 class="size-4 animate-spin" /> Searching…
				</div>
			{:else if ownerQuery.trim() && ownerResults.length === 0}
				<div class="text-muted-foreground px-3 py-3 text-sm">No users match “{ownerQuery}”.</div>
			{:else}
				{#each ownerResults as o (o.id)}
					<form method="post" action="?/create" use:enhance={onCreated}>
						<input type="hidden" name="ownerId" value={o.id} />
						<button
							type="submit"
							class="hover:bg-accent flex w-full flex-col items-start border-b px-3 py-2 text-left text-sm last:border-b-0"
						>
							<span class="font-medium">{o.name || o.email}</span>
							{#if o.name}<span class="text-muted-foreground text-xs">{o.email}</span>{/if}
						</button>
					</form>
				{/each}
			{/if}
		</div>
	</Dialog.Content>
</Dialog.Root>

<div class="relative mb-4">
	<Search class="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
	<Input placeholder="Search by code or name…" bind:value={query} class="pl-9" />
</div>

<div class="bg-card overflow-x-auto rounded-xl border">
	<table class="w-full text-sm">
		<thead class="border-b">
			<tr class="text-muted-foreground text-left text-xs uppercase tracking-wide">
				<th class="px-4 py-3 font-medium">Code</th>
				<th class="px-4 py-3 font-medium">Creator</th>
				<th class="px-4 py-3 font-medium">Created</th>
				<th class="px-4 py-3 font-medium">Owner</th>
				<th class="px-4 py-3 font-medium">Status</th>
				<th class="px-4 py-3 text-right font-medium">Actions</th>
			</tr>
		</thead>
		<tbody>
			{#each filteredInvites as i (i.id)}
				<tr class="hover:bg-accent/40 border-b align-middle last:border-b-0">
					<td class="px-4 py-3 font-mono text-xs">{i.id}</td>
					<td class="text-muted-foreground px-4 py-3 text-xs">
						<span class="inline-flex items-center gap-1">
							{i.creatorName ?? 'System'}
							{#if i.creatorName}
								<form method="post" action="?/clearCreator" use:enhance>
									<input type="hidden" name="id" value={i.id} />
									<button
										type="submit"
										class="hover:text-destructive inline-flex"
										aria-label="Clear creator"
										title="Clear creator"
									>
										<X class="size-3" />
									</button>
								</form>
							{/if}
						</span>
					</td>
					<td class="text-muted-foreground px-4 py-3 text-xs tabular-nums">
						{dateFmt.format(i.createdAt)}
					</td>
					<td class="text-muted-foreground px-4 py-3 text-xs">
						<span class="inline-flex items-center gap-1">
							{i.ownerName ?? 'None'}
							{#if i.ownerName}
								<form method="post" action="?/clearOwner" use:enhance>
									<input type="hidden" name="id" value={i.id} />
									<button
										type="submit"
										class="hover:text-destructive inline-flex"
										aria-label="Clear owner"
										title="Clear owner"
									>
										<X class="size-3" />
									</button>
								</form>
							{/if}
						</span>
					</td>
					<td class="px-4 py-3">
						{#if i.redeemedByUserId}
							<Badge variant="secondary">
								Redeemed{i.redeemedByName ? ` · ${i.redeemedByName}` : ''}
							</Badge>
						{:else}
							<Badge variant="outline">
								Pending{i.intendedForEmail ? ` · ${i.intendedForEmail}` : ''}
							</Badge>
						{/if}
					</td>
					<td class="px-4 py-3">
						<div class="flex items-center justify-end gap-2">
							{#if !i.redeemedByUserId}
								<Button size="sm" variant="outline" onclick={() => copyLink(i.id)}>
									<Copy class="size-3.5" />
									{copied === i.id ? 'Copied' : 'Copy link'}
								</Button>
							{/if}
							<form
								method="post"
								action="?/delete"
								use:enhance={({ cancel }) => {
									const msg = i.redeemedByUserId
										? `Delete redeemed invite ${i.id}? This removes the referral record for ${i.redeemedByName ?? 'the redeemer'}.`
										: `Delete invite ${i.id}? If you've already shared this code it will stop working.`;
									if (!confirm(msg)) cancel();
								}}
							>
								<input type="hidden" name="id" value={i.id} />
								<Button
									type="submit"
									size="sm"
									variant="ghost"
									class="text-destructive hover:text-destructive"
									aria-label="Delete invite"
								>
									<Trash2 class="size-3.5" />
								</Button>
							</form>
						</div>
					</td>
				</tr>
			{:else}
				<tr>
					<td colspan="6" class="text-muted-foreground py-8 text-center">
						{data.invites.length === 0 ? 'No invites yet.' : 'No invites match your search.'}
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>
