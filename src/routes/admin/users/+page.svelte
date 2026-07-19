<script lang="ts">
	import { goto } from '$app/navigation';
	import { Badge } from '$lib/components/ui/badge';
	import { Input } from '$lib/components/ui/input';
	import { Check, Gift, Search, ThumbsUp } from '@lucide/svelte';
	import { PLAN_NAME } from '$lib/subscription';

	let { data } = $props();

	const dateFmt = new Intl.DateTimeFormat('en-US', {
		year: 'numeric',
		month: 'short',
		day: 'numeric'
	});

	let query = $state('');
	const filteredUsers = $derived.by(() => {
		const q = query.trim().toLowerCase();
		if (!q) return data.users;
		return data.users.filter(
			(u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
		);
	});
</script>

<svelte:head>
	<title>Admin · Users · Curiomancer</title>
</svelte:head>

<div class="relative mb-4">
	<Search class="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
	<Input placeholder="Search by name or email…" bind:value={query} class="pl-9" />
</div>

<div class="bg-card overflow-x-auto rounded-xl border">
	<table class="w-full text-sm">
		<thead class="border-b">
			<tr class="text-muted-foreground text-left text-xs uppercase tracking-wide">
				<th class="px-4 py-3 font-medium">Name</th>
				<th class="px-4 py-3 font-medium">Email</th>
				<th class="px-4 py-3 font-medium">Joined</th>
				<th class="px-4 py-3 font-medium">City</th>
				<th class="px-4 py-3 text-right font-medium">
					<ThumbsUp class="ml-auto size-3.5" />
				</th>
				<th class="px-4 py-3 text-right font-medium">Subscription</th>
			</tr>
		</thead>
		<tbody>
			{#each filteredUsers as u (u.id)}
				<tr
					class="hover:bg-accent/40 cursor-pointer border-b last:border-b-0"
					onclick={() => goto(`/admin/users/${u.id}`)}
				>
					<td class="px-4 py-3">
						<span class="font-medium">{u.name}</span>
						{#if u.role === 'admin'}
							<Badge class="ml-1">Admin</Badge>
						{/if}
					</td>
					<td class="text-muted-foreground px-4 py-3 text-xs">{u.email}</td>
					<td class="text-muted-foreground px-4 py-3 text-xs tabular-nums">
						{dateFmt.format(u.createdAt)}
					</td>
					<td class="text-muted-foreground px-4 py-3 text-xs">{u.city ?? '-'}</td>
					<td class="px-4 py-3 text-right tabular-nums">{u.likes}</td>
					<td class="px-4 py-3 text-right">
						{#if u.subscriptionStatus === 'active'}
							<Badge variant="secondary" class="gap-1">
								<Check class="size-3" />
								{PLAN_NAME}
							</Badge>
						{:else if u.subscriptionStatus === 'granted'}
							<Badge variant="outline" class="gap-1">
								<Gift class="size-3" />
								Granted
							</Badge>
						{:else}
							<span class="text-muted-foreground text-xs">Free</span>
						{/if}
					</td>
				</tr>
			{:else}
				<tr>
					<td colspan="6" class="text-muted-foreground py-8 text-center">
						{data.users.length === 0 ? 'No users.' : 'No users match your search.'}
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>
