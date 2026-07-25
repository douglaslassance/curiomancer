<script lang="ts">
	import { Input } from '$lib/components/ui/input';
	import { Badge } from '$lib/components/ui/badge';
	import ConfirmDeleteButton from '$lib/components/confirm-delete-button.svelte';
	import { Search, Trash2 } from '@lucide/svelte';

	let { data } = $props();

	const dateFmt = new Intl.DateTimeFormat('en-US', {
		year: 'numeric',
		month: 'short',
		day: 'numeric'
	});

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

	const filteredTokens = $derived.by(() => {
		const q = query.trim().toLowerCase();
		if (!q) return data.tokens;
		return data.tokens.filter(
			(t) =>
				t.name.toLowerCase().includes(q) ||
				t.kind.toLowerCase().includes(q) ||
				t.prefix.toLowerCase().includes(q) ||
				t.userName.toLowerCase().includes(q) ||
				t.userEmail.toLowerCase().includes(q)
		);
	});
</script>

<svelte:head>
	<title>Admin · API tokens · Curiomancer</title>
</svelte:head>

<div class="mb-4 flex items-center gap-2">
	<div class="relative flex-1">
		<Search class="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
		<Input
			placeholder="Search by token name, prefix, or owner…"
			value={queryInput}
			oninput={(e) => onQuery(e.currentTarget.value)}
			class="pl-9"
		/>
	</div>
</div>

<div class="bg-card overflow-x-auto rounded-xl border">
	<table class="w-full text-sm">
		<thead class="border-b">
			<tr class="text-muted-foreground text-left text-xs uppercase tracking-wide">
				<th class="px-4 py-3 font-medium">Token</th>
				<th class="px-4 py-3 font-medium">Owner</th>
				<th class="px-4 py-3 font-medium">Created</th>
				<th class="px-4 py-3 font-medium">Last used</th>
				<th class="px-4 py-3 text-right font-medium">Actions</th>
			</tr>
		</thead>
		<tbody>
			{#each filteredTokens as t (t.id)}
				<tr class="hover:bg-accent/40 border-b align-middle last:border-b-0">
					<td class="px-4 py-3">
						<div class="flex items-center gap-2">
							<p class="font-medium">{t.name}</p>
							<Badge variant={t.kind === 'device' ? 'secondary' : 'outline'}>{t.kind}</Badge>
						</div>
						<p class="text-muted-foreground font-mono text-xs">{t.prefix}…</p>
					</td>
					<td class="px-4 py-3">
						<a class="hover:underline" href="/admin/users/{t.userId}">{t.userName}</a>
						<p class="text-muted-foreground text-xs">{t.userEmail}</p>
					</td>
					<td class="text-muted-foreground px-4 py-3 text-xs tabular-nums">
						{dateFmt.format(t.createdAt)}
					</td>
					<td class="px-4 py-3">
						{#if t.lastUsedAt}
							<Badge variant="secondary" class="tabular-nums">
								{dateFmt.format(t.lastUsedAt)}
							</Badge>
						{:else}
							<Badge variant="outline">Never</Badge>
						{/if}
					</td>
					<td class="px-4 py-3">
						<div class="flex items-center justify-end gap-2">
							<ConfirmDeleteButton
								action="?/revoke"
								value={t.id}
								label="Revoke token"
								class="text-destructive hover:text-destructive"
							>
								{#snippet icon()}
									<Trash2 class="size-3.5" />
								{/snippet}
							</ConfirmDeleteButton>
						</div>
					</td>
				</tr>
			{:else}
				<tr>
					<td colspan="5" class="text-muted-foreground py-8 text-center">
						{data.tokens.length === 0 ? 'No API tokens yet.' : 'No tokens match your search.'}
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>
