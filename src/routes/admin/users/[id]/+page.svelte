<script lang="ts">
	import { enhance } from '$app/forms';
	import UserPortrait from '$lib/components/user-portrait.svelte';
	import RankBars from '$lib/components/rank-bars.svelte';
	import * as Card from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Separator } from '$lib/components/ui/separator';
	import {
		Check,
		ExternalLink,
		Gift,
		Loader2,
		Mail,
		MapPin,
		Shield,
		VenetianMask
	} from '@lucide/svelte';
	import { PLAN_NAME } from '$lib/subscription';

	let { data, form } = $props();
	const u = $derived(data.user);
	// Viewing your own profile: you can be granted nothing and can't demote
	// yourself, which is what keeps at least one admin in place.
	const isSelf = $derived(data.isSelf);

	const dateFmt = new Intl.DateTimeFormat('en-US', {
		year: 'numeric',
		month: 'short',
		day: 'numeric'
	});

	let subscriptionBusy = $state(false);
	let roleBusy = $state(false);
	let impersonating = $state(false);

	const stats = $derived([
		{ label: 'Likes', value: u.likes },
		{ label: 'Dislikes', value: u.dislikes },
		{ label: 'Want to go', value: u.wantToGo },
		{ label: 'Been there', value: u.seen }
	]);

	// Ratings on places we never got coordinates for (old manual entries) can't
	// be plotted, so say how many made it onto the map.
	const cityRatings = $derived(data.ratingCities.reduce((sum, c) => sum + c.count, 0));
</script>

<svelte:head>
	<title>Admin · {u.name} · Curiomancer</title>
</svelte:head>

<div class="space-y-6">
	<Card.Root>
		<div class="flex items-start gap-4 px-6">
			<UserPortrait name={u.name} image={u.image} size={72} />
			<div class="flex min-w-0 flex-1 items-start gap-4">
				<div class="min-w-0 flex-1">
					<Card.Title class="flex items-center gap-2">
						{u.name}
						{#if u.role === 'admin'}
							<Badge>Admin</Badge>
						{/if}
					</Card.Title>
					<!-- Two rows rather than one wrapping line. The email is long enough to
					     crowd everything else onto the card edge, and it is the field most
					     likely to need the full width, so it gets its own line. -->
					<Card.Description class="mt-1 flex flex-col gap-1 text-xs">
						<span class="flex min-w-0 items-center gap-1">
							<Mail class="size-3 shrink-0" />
							<span class="truncate">{u.email}</span>
						</span>
						<span class="flex flex-wrap items-center gap-x-3 gap-y-1">
							{#if u.city}
								<span class="flex items-center gap-1">
									<MapPin class="size-3 shrink-0" />
									{u.city}{u.countryCode ? `, ${u.countryCode}` : ''}
								</span>
							{/if}
							<span>Joined {dateFmt.format(u.createdAt)}</span>
						</span>
					</Card.Description>
				</div>
				<Button href={`/users/${u.id}`} size="sm" variant="outline">
					Public profile
					<ExternalLink class="size-3.5" />
				</Button>
			</div>
		</div>
	</Card.Root>

	<!-- Everything below is its own card. A portrait running flush to the edges
	     needs the card to end where it ends, otherwise the header has no outline
	     of its own and the image reads as floating above unrelated content. -->
	<Card.Root>
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
						{u.invitesCreated} created · {u.invitesRemaining} left of {u.inviteLimit}
					</p>
					<form
						method="post"
						action="?/setInviteLimit"
						use:enhance
						class="mt-2 flex items-center gap-2"
					>
						<Input
							name="inviteLimit"
							type="number"
							min="0"
							value={u.inviteLimit}
							class="h-8 w-20"
						/>
						<Button type="submit" size="sm" variant="outline">Set limit</Button>
					</form>
					{#if form?.limitError}
						<p class="text-destructive mt-1 text-xs">{form.limitError}</p>
					{:else if form?.limitSet !== undefined}
						<p class="text-muted-foreground mt-1 text-xs">Limit updated.</p>
					{/if}
				</div>
				<div class="min-w-0 flex-1">
					<div class="text-sm font-medium">Referred by</div>
					<p class="text-muted-foreground mt-1 text-sm">{u.referredByName ?? '-'}</p>
				</div>
			</div>

			<Separator />

			<!-- API token limit -->
			<div class="min-w-0 flex-1">
				<div class="text-sm font-medium">API tokens</div>
				<p class="text-muted-foreground mt-1 text-sm">
					{u.apiTokensUsed} of {u.apiTokenLimit} used
				</p>
				<form
					method="post"
					action="?/setApiTokenLimit"
					use:enhance
					class="mt-2 flex items-center gap-2"
				>
					<Input
						name="apiTokenLimit"
						type="number"
						min="0"
						value={u.apiTokenLimit}
						class="h-8 w-20"
					/>
					<Button type="submit" size="sm" variant="outline">Set limit</Button>
				</form>
				{#if form?.tokenLimitError}
					<p class="text-destructive mt-1 text-xs">{form.tokenLimitError}</p>
				{:else if form?.tokenLimitSet !== undefined}
					<p class="text-muted-foreground mt-1 text-xs">Limit updated.</p>
				{/if}
			</div>

			<Separator />

			<!-- Subscription -->
			<div class="flex items-start gap-3">
				<div class="min-w-0 flex-1">
					<div class="flex items-center gap-2 text-sm font-medium">
						Subscription
						{#if u.subscriptionStatus === 'active'}
							<Badge variant="secondary" class="gap-1"><Check class="size-3" />{PLAN_NAME}</Badge>
						{:else if u.subscriptionStatus === 'granted'}
							<Badge variant="outline" class="gap-1"><Gift class="size-3" />Granted</Badge>
						{:else}
							<span class="text-muted-foreground text-xs font-normal">Free</span>
						{/if}
					</div>
					<p class="text-muted-foreground mt-1 text-sm">
						Grant complimentary {PLAN_NAME} or revoke it.
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

			<Separator />

			<div class="flex items-start gap-3">
				<div class="min-w-0 flex-1">
					<div class="flex items-center gap-2 text-sm font-medium">
						Admin rights
						{#if u.role === 'admin'}
							<Badge variant="secondary" class="gap-1"><Shield class="size-3" />Admin</Badge>
						{:else}
							<span class="text-muted-foreground text-xs font-normal">User</span>
						{/if}
					</div>
					<p class="text-muted-foreground mt-1 text-sm">
						{#if isSelf}
							You can't remove your own admin rights, so the app always keeps at least one admin.
						{:else}
							Full access to this panel, including granting admin rights to others.
						{/if}
					</p>
					{#if form?.roleError}
						<p class="text-destructive mt-1 text-sm">{form.roleError}</p>
					{/if}
				</div>
				<form
					method="post"
					action="?/setRole"
					use:enhance={() => {
						roleBusy = true;
						return async ({ update }) => {
							await update();
							roleBusy = false;
						};
					}}
				>
					<Button
						type="submit"
						size="sm"
						variant={u.role === 'admin' ? 'outline' : 'secondary'}
						disabled={roleBusy || (u.role === 'admin' && isSelf)}
					>
						{#if roleBusy}
							<Loader2 class="size-3.5 animate-spin" />
						{:else if u.role === 'admin'}
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

	<Card.Root>
		<Card.Header>
			<Card.Title>Where they rate</Card.Title>
			<Card.Description>
				{cityRatings}
				{cityRatings === 1 ? 'rating' : 'ratings'} across {data.ratingCities.length}
				{data.ratingCities.length === 1 ? 'city' : 'cities'}, most rated first.
			</Card.Description>
		</Card.Header>
		<Card.Content>
			<RankBars
				items={data.ratingCities.map((c) => ({ label: c.city, count: c.count }))}
				max={10}
				empty="No rated places yet."
			/>
		</Card.Content>
	</Card.Root>
</div>
