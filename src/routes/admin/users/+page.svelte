<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';

	let { data } = $props();

	const dateFmt = new Intl.DateTimeFormat('en-US', {
		year: 'numeric',
		month: 'short',
		day: 'numeric'
	});
</script>

<svelte:head>
	<title>Admin · Users — Curiomancer</title>
</svelte:head>

<div class="bg-card overflow-x-auto rounded-xl border">
	<table class="w-full text-sm">
		<thead class="border-b">
			<tr class="text-muted-foreground text-left text-xs uppercase tracking-wide">
				<th class="px-4 py-3 font-medium">Name</th>
				<th class="px-4 py-3 font-medium">Email</th>
				<th class="px-4 py-3 font-medium">Joined</th>
				<th class="px-4 py-3 font-medium">City</th>
				<th class="px-4 py-3 text-right font-medium">👍</th>
				<th class="px-4 py-3 text-right font-medium">👎</th>
				<th class="px-4 py-3 text-right font-medium">Invites left</th>
				<th class="px-4 py-3 font-medium">Referred by</th>
			</tr>
		</thead>
		<tbody>
			{#each data.users as u (u.id)}
				<tr class="hover:bg-accent/40 border-b last:border-b-0">
					<td class="px-4 py-3">
						<a href={`/users/${u.id}`} class="font-medium hover:underline">{u.name}</a>
						{#if u.role === 'admin'}
							<Badge class="ml-1">Admin</Badge>
						{/if}
					</td>
					<td class="text-muted-foreground px-4 py-3 text-xs">{u.email}</td>
					<td class="text-muted-foreground px-4 py-3 text-xs tabular-nums">
						{dateFmt.format(u.createdAt)}
					</td>
					<td class="text-muted-foreground px-4 py-3 text-xs">{u.city ?? '—'}</td>
					<td class="px-4 py-3 text-right tabular-nums">{u.likes}</td>
					<td class="px-4 py-3 text-right tabular-nums">{u.dislikes}</td>
					<td class="px-4 py-3 text-right tabular-nums">{u.invitesRemaining}</td>
					<td class="text-muted-foreground px-4 py-3 text-xs">{u.referredByName ?? '—'}</td>
				</tr>
			{:else}
				<tr><td colspan="8" class="text-muted-foreground py-8 text-center">No users.</td></tr>
			{/each}
		</tbody>
	</table>
</div>
