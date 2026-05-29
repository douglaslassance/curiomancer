<script lang="ts">
	import { enhance } from '$app/forms';
	import * as Avatar from '$lib/components/ui/avatar';
	import * as Card from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Separator } from '$lib/components/ui/separator';
	import InviteCard from '$lib/components/invite-card.svelte';
	import { LogOut, Mail, MapPin, Sparkles, ThumbsUp, User } from '@lucide/svelte';

	let { data } = $props();

	const initials = $derived(
		data.profile.name
			.split(/\s+/)
			.filter(Boolean)
			.slice(0, 2)
			.map((s: string) => s[0]?.toUpperCase() ?? '')
			.join('') || '?'
	);

	const invitesRemaining = $derived(data.invites.filter((i) => i.redeemedByUserId === null).length);
</script>

<svelte:head>
	<title>Settings — Bond</title>
</svelte:head>

<div class="mx-auto max-w-xl py-4">
	<header class="mb-6">
		<h1 class="text-2xl font-semibold tracking-tight">Settings</h1>
		<p class="text-muted-foreground mt-1 text-sm">
			Your account and preferences. More controls land here as the product grows.
		</p>
	</header>

	<Card.Root>
		<Card.Header>
			<div class="flex items-center gap-4">
				<Avatar.Root class="size-14">
					{#if data.profile.image}
						<Avatar.Image src={data.profile.image} alt={data.profile.name} />
					{/if}
					<Avatar.Fallback class="text-base font-medium">{initials}</Avatar.Fallback>
				</Avatar.Root>
				<div class="min-w-0">
					<Card.Title class="flex items-center gap-2">
						{data.profile.name}
						{#if data.profile.role === 'admin'}
							<Badge variant="default">Admin</Badge>
						{/if}
					</Card.Title>
					<Card.Description class="mt-0.5 flex items-center gap-1.5 text-xs">
						<Mail class="size-3" />
						{data.profile.email}
					</Card.Description>
				</div>
			</div>
		</Card.Header>
		<Card.Content class="space-y-4">
			<Separator />

			<div class="flex items-start gap-3">
				<MapPin class="text-muted-foreground mt-0.5 size-4" />
				<div class="min-w-0 flex-1">
					<div class="text-sm font-medium">Current location</div>
					{#if data.location}
						<p class="text-muted-foreground text-sm">
							{data.location.city}{data.location.countryCode
								? `, ${data.location.countryCode}`
								: ''}
							{#if data.location.timezone}
								<span class="text-muted-foreground">· {data.location.timezone}</span>
							{/if}
						</p>
					{:else}
						<p class="text-muted-foreground text-sm">
							Not set. The dashboard prompts on first visit.
						</p>
					{/if}
				</div>
			</div>

			<div class="flex items-start gap-3">
				<ThumbsUp class="text-muted-foreground mt-0.5 size-4" />
				<div class="min-w-0 flex-1">
					<div class="text-sm font-medium">Likes</div>
					<p class="text-muted-foreground text-sm">
						You've liked {data.likeCount} place{data.likeCount === 1 ? '' : 's'}.
						<a href="/places?filter=liked" class="underline">View</a>
					</p>
				</div>
			</div>

			<Separator />

			<!-- Invites -->
			<div class="flex items-start gap-3">
				<Sparkles class="text-muted-foreground mt-0.5 size-4" />
				<div class="min-w-0 flex-1">
					<div class="flex items-baseline justify-between gap-2">
						<div class="text-sm font-medium">Invites</div>
						<span class="text-muted-foreground text-xs">
							{invitesRemaining} of {data.invites.length} remaining
						</span>
					</div>
					<p class="text-muted-foreground mt-1 text-sm">
						Share these links with people whose taste you trust.
					</p>
					<div class="mt-3 space-y-2">
						{#each data.invites as inv (inv.id)}
							<InviteCard invite={inv} />
						{:else}
							<p class="text-muted-foreground text-xs">No invites yet.</p>
						{/each}
					</div>
				</div>
			</div>

			<Separator />

			<div class="flex items-start gap-3">
				<User class="text-muted-foreground mt-0.5 size-4" />
				<div class="min-w-0 flex-1">
					<div class="text-sm font-medium">Coming soon</div>
					<p class="text-muted-foreground text-sm">
						Editing your name, avatar upload, Instagram handle, change-password, and account
						deletion all live here.
					</p>
				</div>
			</div>
		</Card.Content>
		<Card.Footer>
			<form method="post" action="/sign-out" use:enhance class="contents">
				<Button type="submit" variant="outline">
					<LogOut class="size-4" />
					Sign out
				</Button>
			</form>
		</Card.Footer>
	</Card.Root>
</div>
