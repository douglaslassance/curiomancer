<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { Input } from '$lib/components/ui/input';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Copy, Plus, Search } from '@lucide/svelte';

	let { data } = $props();

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
				(i.createdByName ?? '').toLowerCase().includes(q) ||
				(i.redeemedByName ?? '').toLowerCase().includes(q)
		);
	});
</script>

<svelte:head>
	<title>Admin · Invites · Curiomancer</title>
</svelte:head>

<div class="mb-4 flex items-center justify-between gap-4">
	<p class="text-muted-foreground text-sm">
		{data.invites.length} total · {redeemedCount} redeemed
	</p>
	<form method="post" action="?/create" use:enhance>
		<Button type="submit" size="sm">
			<Plus class="size-4" />
			Create invite
		</Button>
	</form>
</div>

<div class="relative mb-4">
	<Search class="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
	<Input placeholder="Search by code or name…" bind:value={query} class="pl-9" />
</div>

<div class="bg-card overflow-x-auto rounded-xl border">
	<table class="w-full text-sm">
		<thead class="border-b">
			<tr class="text-muted-foreground text-left text-xs uppercase tracking-wide">
				<th class="px-4 py-3 font-medium">Code</th>
				<th class="px-4 py-3 font-medium">Created by</th>
				<th class="px-4 py-3 font-medium">Created</th>
				<th class="px-4 py-3 font-medium">Status</th>
				<th class="px-4 py-3 text-right font-medium">Action</th>
			</tr>
		</thead>
		<tbody>
			{#each filteredInvites as i (i.id)}
				<tr class="hover:bg-accent/40 border-b align-middle last:border-b-0">
					<td class="px-4 py-3 font-mono text-xs">{i.id}</td>
					<td class="text-muted-foreground px-4 py-3 text-xs">{i.createdByName ?? '-'}</td>
					<td class="text-muted-foreground px-4 py-3 text-xs tabular-nums">
						{dateFmt.format(i.createdAt)}
					</td>
					<td class="px-4 py-3">
						{#if i.redeemedByUserId}
							<Badge variant="secondary">
								Redeemed{i.redeemedByName ? ` · ${i.redeemedByName}` : ''}
							</Badge>
						{:else}
							<Badge variant="outline">Pending</Badge>
						{/if}
					</td>
					<td class="px-4 py-3 text-right">
						{#if !i.redeemedByUserId}
							<Button size="sm" variant="outline" onclick={() => copyLink(i.id)}>
								<Copy class="size-3.5" />
								{copied === i.id ? 'Copied' : 'Copy link'}
							</Button>
						{/if}
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
