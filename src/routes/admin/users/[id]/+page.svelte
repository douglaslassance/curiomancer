<script lang="ts">
	import { enhance } from '$app/forms';
	import * as Avatar from '$lib/components/ui/avatar';
	import * as Card from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Separator } from '$lib/components/ui/separator';
	import { Check, ExternalLink, Loader2, Mail, MapPin, VenetianMask } from '@lucide/svelte';

	let { data, form } = $props();
	const u = $derived(data.user);

	const dateFmt = new Intl.DateTimeFormat('en-US', {
		year: 'numeric',
		month: 'short',
		day: 'numeric'
	});

	const initials = $derived(
		u.name
			.split(/\s+/)
			.filter(Boolean)
			.slice(0, 2)
			.map((s) => s[0]?.toUpperCase() ?? '')
			.join('') || '?'
	);

	let subscriptionBusy = $state(false);
	let impersonating = $state(false);

	const stats = $derived([
		{ label: 'Likes', value: u.likes },
		{ label: 'Dislikes', value: u.dislikes },
		{ label: 'Want to go', value: u.wantToGo },
		{ label: 'Been there', value: u.seen }
	]);
</script>

<svelte:head>
	<title>Admin · {u.name} · Curiomancer</title>
</svelte:head>

<div>
	<Card.Root>
		<Card.Header>
			<div class="flex items-start gap-4">
				<Avatar.Root class="size-14">
					{#if u.image}
						<Avatar.Image src={u.image} alt={u.name} />
					{/if}
					<Avatar.Fallback class="text-base font-medium">{initials}</Avatar.Fallback>
				</Avatar.Root>
				<div class="min-w-0 flex-1">
					<Card.Title class="flex items-center gap-2">
						{u.name}
						{#if u.role === 'admin'}
							<Badge>Admin</Badge>
						{/if}
					</Card.Title>
					<Card.Description class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
						<span class="flex items-center gap-1"><Mail class="size-3" />{u.email}</span>
						{#if u.city}
							<span class="flex items-center gap-1">
								<MapPin class="size-3" />
								{u.city}{u.countryCode ? `, ${u.countryCode}` : ''}
							</span>
						{/if}
						<span>Joined {dateFmt.format(u.createdAt)}</span>
					</Card.Description>
				</div>
				<Button href={`/users/${u.id}`} size="sm" variant="outline">
					Public profile
					<ExternalLink class="size-3.5" />
				</Button>
			</div>
		</Card.Header>

		<Card.Content class="space-y-4">
			<!-- Taste stats -->
			<div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
				{#each stats as s (s.label)}
					<div class="rounded-lg border px-3 py-2">
						<div class="text-xl font-semibold tabular-nums">{s.value}</div>
						<div class="text-muted-foreground text-xs">{s.label}</div>
					</div>
				{/each}
			</div>

			<Separator />

			<!-- Invites + referral -->
			<div class="flex items-start gap-3">
				<div class="min-w-0 flex-1">
					<div class="text-sm font-medium">Invites</div>
					<p class="text-muted-foreground mt-1 text-sm">
						{u.invitesRemaining} of {u.invitesTotal} remaining
					</p>
				</div>
				<div class="min-w-0 flex-1">
					<div class="text-sm font-medium">Referred by</div>
					<p class="text-muted-foreground mt-1 text-sm">{u.referredByName ?? '-'}</p>
				</div>
			</div>

			<Separator />

			<!-- Subscription -->
			<div class="flex items-start gap-3">
				<div class="min-w-0 flex-1">
					<div class="flex items-center gap-2 text-sm font-medium">
						Subscription
						{#if u.isSubscriber}
							<Badge variant="secondary" class="gap-1"><Check class="size-3" />Active</Badge>
						{:else}
							<span class="text-muted-foreground text-xs font-normal">Free</span>
						{/if}
					</div>
					<p class="text-muted-foreground mt-1 text-sm">
						Grant a complimentary subscription or revoke it.
					</p>
				</div>
				<form
					method="post"
					action={u.isSubscriber ? '?/revokeSubscription' : '?/grantSubscription'}
					use:enhance={() => {
						subscriptionBusy = true;
						return async ({ update }) => {
							await update();
							subscriptionBusy = false;
						};
					}}
				>
					<Button
						type="submit"
						size="sm"
						variant={u.isSubscriber ? 'outline' : 'secondary'}
						disabled={subscriptionBusy}
					>
						{#if subscriptionBusy}
							<Loader2 class="size-3.5 animate-spin" />
						{:else if u.isSubscriber}
							Revoke
						{:else}
							Grant
						{/if}
					</Button>
				</form>
			</div>

			{#if data.canImpersonate}
				<Separator />

				<div class="flex items-start gap-3">
					<div class="min-w-0 flex-1">
						<div class="text-sm font-medium">Impersonate</div>
						<p class="text-muted-foreground mt-1 text-sm">
							Sign in as this user to debug their view (dev only).
						</p>
					</div>
					<form
						method="post"
						action="?/impersonate"
						use:enhance={() => {
							impersonating = true;
							return async ({ result, update }) => {
								if (result.type !== 'redirect') impersonating = false;
								await update();
							};
						}}
					>
						<Button type="submit" size="sm" variant="outline" disabled={impersonating}>
							{#if impersonating}
								<Loader2 class="size-3.5 animate-spin" />
							{:else}
								<VenetianMask class="size-3.5" />
							{/if}
							Impersonate
						</Button>
					</form>
				</div>
			{/if}

			{#if form?.message}
				<p class="text-destructive text-sm">{form.message}</p>
			{/if}
		</Card.Content>
	</Card.Root>
</div>
