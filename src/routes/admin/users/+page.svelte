<script lang="ts">
	import { page } from '$app/state';
	import { enhance } from '$app/forms';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Check, Loader2, Search, ThumbsDown, ThumbsUp, VenetianMask } from '@lucide/svelte';

	let { data, form } = $props();

	const dateFmt = new Intl.DateTimeFormat('en-US', {
		year: 'numeric',
		month: 'short',
		day: 'numeric'
	});

	let impersonatingId = $state<string | null>(null);
	let subscriptionBusyId = $state<string | null>(null);

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
				<th class="px-4 py-3 text-right font-medium">
					<ThumbsDown class="ml-auto size-3.5" />
				</th>
				<th class="px-4 py-3 text-right font-medium">Invites left</th>
				<th class="px-4 py-3 font-medium">Referred by</th>
				<th class="px-4 py-3 text-right font-medium">Subscriber</th>
				{#if data.canImpersonate}
					<th class="px-4 py-3 text-right font-medium">Dev</th>
				{/if}
			</tr>
		</thead>
		<tbody>
			{#each filteredUsers as u (u.id)}
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
					<td class="text-muted-foreground px-4 py-3 text-xs">{u.city ?? '-'}</td>
					<td class="px-4 py-3 text-right tabular-nums">{u.likes}</td>
					<td class="px-4 py-3 text-right tabular-nums">{u.dislikes}</td>
					<td class="px-4 py-3 text-right tabular-nums">{u.invitesRemaining}</td>
					<td class="text-muted-foreground px-4 py-3 text-xs">{u.referredByName ?? '-'}</td>
					<td class="px-4 py-3">
						<div class="flex items-center justify-end gap-2">
							{#if u.isSubscriber}
								<Badge variant="secondary" class="gap-1">
									<Check class="size-3" />
									Subscriber
								</Badge>
							{:else}
								<span class="text-muted-foreground text-xs">Free</span>
							{/if}
							<form
								method="post"
								action={u.isSubscriber ? '?/revokeSubscription' : '?/grantSubscription'}
								use:enhance={() => {
									subscriptionBusyId = u.id;
									return async ({ update }) => {
										await update();
										subscriptionBusyId = null;
									};
								}}
							>
								<input type="hidden" name="userId" value={u.id} />
								<Button
									type="submit"
									size="sm"
									variant={u.isSubscriber ? 'outline' : 'secondary'}
									disabled={subscriptionBusyId === u.id}
								>
									{#if subscriptionBusyId === u.id}
										<Loader2 class="size-3.5 animate-spin" />
									{:else if u.isSubscriber}
										Revoke
									{:else}
										Grant
									{/if}
								</Button>
							</form>
						</div>
					</td>
					{#if data.canImpersonate}
						<td class="px-4 py-3 text-right">
							{#if u.id !== page.data.user?.id}
								<form
									method="post"
									action="?/impersonate"
									use:enhance={() => {
										impersonatingId = u.id;
										return async ({ result, update }) => {
											if (result.type !== 'redirect') impersonatingId = null;
											await update();
										};
									}}
								>
									<input type="hidden" name="userId" value={u.id} />
									<Button
										type="submit"
										size="sm"
										variant="outline"
										disabled={impersonatingId === u.id}
									>
										{#if impersonatingId === u.id}
											<Loader2 class="size-3.5 animate-spin" />
										{:else}
											<VenetianMask class="size-3.5" />
										{/if}
										Impersonate
									</Button>
								</form>
							{/if}
						</td>
					{/if}
				</tr>
			{:else}
				<tr>
					<td colspan={data.canImpersonate ? 10 : 9} class="text-muted-foreground py-8 text-center">
						{data.users.length === 0 ? 'No users.' : 'No users match your search.'}
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>

{#if form?.message}
	<p class="text-destructive mt-3 text-sm">{form.message}</p>
{/if}
