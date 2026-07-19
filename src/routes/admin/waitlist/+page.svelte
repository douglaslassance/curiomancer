<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Dialog from '$lib/components/ui/dialog';
	import CityInput from '$lib/components/city-input.svelte';
	import { Copy, Plus, Search, Trash2 } from '@lucide/svelte';

	let { data, form } = $props();

	// Add-by-hand dialog. Fields are controlled so we can clear them after a
	// successful add and close the dialog.
	let addOpen = $state(false);
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


	let query = $state('');
	const filteredEntries = $derived.by(() => {
		const q = query.trim().toLowerCase();
		if (!q) return data.entries;
		return data.entries.filter(
			(e) => e.email.toLowerCase().includes(q) || (e.city ?? '').toLowerCase().includes(q)
		);
	});
</script>

<svelte:head>
	<title>Admin · Waitlist · Curiomancer</title>
</svelte:head>

<!-- Add someone by hand (same email + city as the public signup). -->
<Dialog.Root bind:open={addOpen}>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>Add to waitlist</Dialog.Title>
			<Dialog.Description>Add someone by hand, same as the public signup.</Dialog.Description>
		</Dialog.Header>

		<form
			method="post"
			action="?/add"
			use:enhance={() => {
				return async ({ result, update }) => {
					await update();
					if (result.type === 'success') {
						email = '';
						city = '';
						addOpen = false;
					}
				};
			}}
			class="space-y-3"
		>
			<div class="space-y-1.5">
				<Label for="wl-email">Email</Label>
				<Input
					id="wl-email"
					name="email"
					type="text"
					inputmode="email"
					placeholder="you@example.com"
					autocomplete="off"
					data-1p-ignore
					data-lpignore="true"
					data-form-type="other"
					bind:value={email}
				/>
			</div>
			<div class="space-y-1.5">
				<Label for="wl-city">City</Label>
				<CityInput id="wl-city" bind:value={city} placeholder="City" />
			</div>
			{#if form?.addError}
				<p class="text-destructive text-xs">{form.addError}</p>
			{/if}
			<Dialog.Footer>
				<Button type="submit">
					<Plus class="size-4" />
					Add
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>

<div class="mb-4 flex items-center gap-2">
	<div class="relative flex-1">
		<Search class="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
		<Input placeholder="Search by email or city…" bind:value={query} class="pl-9" />
	</div>
	<Button onclick={() => (addOpen = true)}>
		<Plus class="size-4" />
		Add to waitlist
	</Button>
</div>

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
			{#each filteredEntries as e (e.id)}
				<tr class="hover:bg-accent/40 border-b align-middle last:border-b-0">
					<td class="px-4 py-3">{e.email}</td>
					<td class="text-muted-foreground px-4 py-3 text-xs">{e.city ?? '-'}</td>
					<td class="text-muted-foreground px-4 py-3 text-xs tabular-nums">
						{dateFmt.format(e.createdAt)}
					</td>
					<td class="px-4 py-3">
						{#if e.status === 'invited' && e.redeemedAt}
							<Badge>Joined</Badge>
						{:else if e.status === 'invited'}
							<Badge variant="secondary">Invited</Badge>
						{:else}
							<Badge variant="outline">Pending</Badge>
						{/if}
					</td>
					<td class="px-4 py-3">
						<div class="flex items-center justify-end gap-2">
							{#if e.status === 'invited' && e.redeemedAt}
								<!-- Invite already redeemed - the link is dead, nothing to do here. -->
							{:else if e.status === 'invited' && e.inviteId}
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
							<form
								method="post"
								action="?/remove"
								use:enhance={({ cancel }) => {
									if (!confirm(`Remove ${e.email} from the waitlist?`)) cancel();
								}}
							>
								<input type="hidden" name="id" value={e.id} />
								<Button type="submit" size="sm" variant="ghost" aria-label="Remove from waitlist">
									<Trash2 class="text-muted-foreground size-3.5" />
								</Button>
							</form>
						</div>
					</td>
				</tr>
			{:else}
				<tr>
					<td colspan="5" class="text-muted-foreground py-8 text-center">
						{data.entries.length === 0 ? 'Nobody waiting yet.' : 'No entries match your search.'}
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>
