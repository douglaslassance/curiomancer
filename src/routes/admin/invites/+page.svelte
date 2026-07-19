<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { Input } from '$lib/components/ui/input';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Copy, Plus, Search, Trash2 } from '@lucide/svelte';

	let { data, form } = $props();

	// Invite dialog: enter a friend's email, we mint + send the invite.
	let createOpen = $state(false);
	let inviteEmail = $state('');
	const onCreated = () => {
		return async ({ result, update }: { result: { type: string }; update: () => Promise<void> }) => {
			await update();
			if (result.type === 'success') {
				inviteEmail = '';
				createOpen = false;
			}
		};
	};

	const dateFmt = new Intl.DateTimeFormat('en-US', {
		year: 'numeric',
		month: 'short',
		day: 'numeric'
	});

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

	// Debounced search: `queryInput` tracks the field live; `query` (what the
	// filter reads) only catches up after typing pauses.
	let queryInput = $state('');
	let query = $state('');
	let filterTimer: ReturnType<typeof setTimeout> | undefined;
	function onQuery(value: string) {
		queryInput = value;
		clearTimeout(filterTimer);
		filterTimer = setTimeout(() => (query = value), 200);
	}

	const filteredInvites = $derived.by(() => {
		const q = query.trim().toLowerCase();
		if (!q) return data.invites;
		return data.invites.filter(
			(i) =>
				i.id.toLowerCase().includes(q) ||
				(i.creatorName ?? '').toLowerCase().includes(q) ||
				(i.invitedEmail ?? '').toLowerCase().includes(q) ||
				(i.redeemedByName ?? '').toLowerCase().includes(q)
		);
	});
</script>

<svelte:head>
	<title>Admin · Invites · Curiomancer</title>
</svelte:head>

<Dialog.Root bind:open={createOpen}>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>Invite</Dialog.Title>
			<Dialog.Description>Send an invite to someone's email.</Dialog.Description>
		</Dialog.Header>

		<form method="post" action="?/create" use:enhance={onCreated} class="space-y-3">
			<!-- type=text + inputmode=email and the data-* flags keep password
			     managers from offering to autofill the admin's own email here. -->
			<Input
				name="recipient"
				type="text"
				inputmode="email"
				placeholder="friend@example.com"
				autocomplete="off"
				data-1p-ignore
				data-lpignore="true"
				data-form-type="other"
				bind:value={inviteEmail}
			/>
			{#if form?.inviteError}
				<p class="text-destructive text-xs">{form.inviteError}</p>
			{/if}
			<Dialog.Footer>
				<Button type="submit">
					<Plus class="size-4" />
					Send invite
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>

<div class="mb-4 flex items-center gap-2">
	<div class="relative flex-1">
		<Search class="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
		<Input
			placeholder="Search by code, email, or name…"
			value={queryInput}
			oninput={(e) => onQuery(e.currentTarget.value)}
			class="pl-9"
		/>
	</div>
	<Button onclick={() => (createOpen = true)}>
		<Plus class="size-4" />
		Invite
	</Button>
</div>

<div class="bg-card overflow-x-auto rounded-xl border">
	<table class="w-full text-sm">
		<thead class="border-b">
			<tr class="text-muted-foreground text-left text-xs uppercase tracking-wide">
				<th class="px-4 py-3 font-medium">Code</th>
				<th class="px-4 py-3 font-medium">Creator</th>
				<th class="px-4 py-3 font-medium">Created</th>
				<th class="px-4 py-3 font-medium">Status</th>
				<th class="px-4 py-3 text-right font-medium">Actions</th>
			</tr>
		</thead>
		<tbody>
			{#each filteredInvites as i (i.id)}
				<tr class="hover:bg-accent/40 border-b align-middle last:border-b-0">
					<td class="px-4 py-3 font-mono text-xs">{i.id}</td>
					<td class="text-muted-foreground px-4 py-3 text-xs">{i.creatorName ?? 'System'}</td>
					<td class="text-muted-foreground px-4 py-3 text-xs tabular-nums">
						{dateFmt.format(i.createdAt)}
					</td>
					<td class="px-4 py-3">
						{#if i.redeemedByUserId}
							<Badge variant="secondary">
								Redeemed{i.redeemedByName ? ` · ${i.redeemedByName}` : ''}
							</Badge>
						{:else}
							<Badge variant="outline">
								Pending{i.invitedEmail ? ` · ${i.invitedEmail}` : ''}
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
					<td colspan="5" class="text-muted-foreground py-8 text-center">
						{data.invites.length === 0 ? 'No invites yet.' : 'No invites match your search.'}
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>
