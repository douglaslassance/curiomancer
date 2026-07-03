<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Copy, Plus } from '@lucide/svelte';

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
			{#each data.invites as i (i.id)}
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
				<tr><td colspan="5" class="text-muted-foreground py-8 text-center">No invites yet.</td></tr>
			{/each}
		</tbody>
	</table>
</div>
