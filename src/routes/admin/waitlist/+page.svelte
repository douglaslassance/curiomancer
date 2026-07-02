<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import CityInput from '$lib/components/city-input.svelte';
	import { Copy, Plus } from '@lucide/svelte';

	let { data, form } = $props();

	// Controlled so we can clear the fields after a successful add.
	let email = $state('');
	let city = $state('');

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
</script>

<svelte:head>
	<title>Admin · Waitlist - Curiomancer</title>
</svelte:head>

<!-- Add someone by hand (same email + city as the public signup). -->
<form
	method="post"
	action="?/add"
	use:enhance={() => {
		return async ({ result, update }) => {
			await update();
			if (result.type === 'success') {
				email = '';
				city = '';
			}
		};
	}}
	class="bg-card mb-4 rounded-xl border p-4"
>
	<div class="flex flex-col gap-3 sm:flex-row sm:items-end">
		<div class="flex-1 space-y-1.5">
			<Label for="wl-email" class="text-xs">Email</Label>
			<Input
				id="wl-email"
				name="email"
				type="email"
				placeholder="you@example.com"
				bind:value={email}
			/>
		</div>
		<div class="flex-1 space-y-1.5">
			<Label for="wl-city" class="text-xs">City</Label>
			<CityInput id="wl-city" bind:value={city} placeholder="City" />
		</div>
		<Button type="submit">
			<Plus class="size-4" />
			Add
		</Button>
	</div>
	{#if form?.addError}
		<p class="text-destructive mt-2 text-xs">{form.addError}</p>
	{:else if form?.added}
		<p class="text-muted-foreground mt-2 text-xs">Added to the waitlist.</p>
	{/if}
</form>

<div class="bg-card overflow-x-auto rounded-xl border">
	<table class="w-full text-sm">
		<thead class="border-b">
			<tr class="text-muted-foreground text-left text-xs uppercase tracking-wide">
				<th class="px-4 py-3 font-medium">Email</th>
				<th class="px-4 py-3 font-medium">City</th>
				<th class="px-4 py-3 font-medium">Joined</th>
				<th class="px-4 py-3 font-medium">Status</th>
				<th class="px-4 py-3 text-right font-medium">Action</th>
			</tr>
		</thead>
		<tbody>
			{#each data.entries as e (e.id)}
				<tr class="hover:bg-accent/40 border-b align-middle last:border-b-0">
					<td class="px-4 py-3">{e.email}</td>
					<td class="text-muted-foreground px-4 py-3 text-xs">{e.city ?? '-'}</td>
					<td class="text-muted-foreground px-4 py-3 text-xs tabular-nums">
						{dateFmt.format(e.createdAt)}
					</td>
					<td class="px-4 py-3">
						{#if e.status === 'invited'}
							<Badge variant="secondary">Invited</Badge>
						{:else}
							<Badge variant="outline">Pending</Badge>
						{/if}
					</td>
					<td class="px-4 py-3 text-right">
						{#if e.status === 'invited' && e.inviteId}
							<Button
								size="sm"
								variant="outline"
								onclick={() => e.inviteId && copyLink(e.inviteId)}
							>
								<Copy class="size-3.5" />
								{copied === e.inviteId ? 'Copied' : 'Copy link'}
							</Button>
						{:else}
							<form method="post" action="?/invite" use:enhance>
								<input type="hidden" name="id" value={e.id} />
								<Button type="submit" size="sm">Invite</Button>
							</form>
						{/if}
					</td>
				</tr>
			{:else}
				<tr
					><td colspan="5" class="text-muted-foreground py-8 text-center">Nobody waiting yet.</td
					></tr
				>
			{/each}
		</tbody>
	</table>
</div>
