<script lang="ts">
	import { enhance } from '$app/forms';
	import * as Avatar from '$lib/components/ui/avatar';
	import * as Card from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Separator } from '$lib/components/ui/separator';
	import InviteCard from '$lib/components/invite-card.svelte';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import {
		AtSign,
		Copy,
		KeyRound,
		Loader2,
		LogOut,
		Mail,
		MapPin,
		RefreshCw,
		Sparkles,
		ThumbsUp,
		Trash2,
		User
	} from '@lucide/svelte';
	import { updateLocation, type LocationUpdateError } from '$lib/location-update';

	let { data, form } = $props();

	let refreshingLocation = $state(false);
	let locationError = $state<string | null>(null);
	let locationHint = $state<string | null>(null);

	async function refreshLocation() {
		refreshingLocation = true;
		locationError = null;
		locationHint = null;
		try {
			await updateLocation();
		} catch (err) {
			const e = err as LocationUpdateError;
			locationError = e.message ?? 'Could not update location.';
			locationHint = e.hint ?? null;
		} finally {
			refreshingLocation = false;
		}
	}

	let tokenCopied = $state(false);
	async function copyToken(token: string) {
		try {
			await navigator.clipboard.writeText(token);
			tokenCopied = true;
			setTimeout(() => (tokenCopied = false), 2000);
		} catch (err) {
			console.error('Clipboard write failed:', err);
		}
	}

	// Local editable copy so the input stays controlled across submits.
	// Server returns the canonical handle (lowercased, no @) so reflecting
	// data.profile.instagram is correct, but on validation failure we keep
	// the user's raw input from form.instagram.
	// svelte-ignore state_referenced_locally
	let instagramInput = $state(data.profile.instagram ?? '');
	$effect(() => {
		if (form?.instagramOk) instagramInput = form.instagram ?? '';
	});

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
	<title>Settings — Curiomancer</title>
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
					<div class="flex items-center justify-between gap-2">
						<div class="text-sm font-medium">Current location</div>
						<Button
							size="sm"
							variant="outline"
							onclick={refreshLocation}
							disabled={refreshingLocation}
						>
							{#if refreshingLocation}
								<Loader2 class="size-3.5 animate-spin" />
								Updating…
							{:else}
								<RefreshCw class="size-3.5" />
								Update
							{/if}
						</Button>
					</div>
					{#if data.location}
						<p class="text-muted-foreground mt-1 text-sm">
							{data.location.city}{data.location.countryCode
								? `, ${data.location.countryCode}`
								: ''}
							{#if data.location.timezone}
								<span class="text-muted-foreground">· {data.location.timezone}</span>
							{/if}
						</p>
					{:else}
						<p class="text-muted-foreground mt-1 text-sm">
							Not set. The dashboard prompts on first visit.
						</p>
					{/if}
					{#if locationError}
						<p class="text-destructive mt-2 text-xs">{locationError}</p>
						{#if locationHint}
							<p class="text-muted-foreground mt-1 text-xs">{locationHint}</p>
						{/if}
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

			<!-- Instagram handle -->
			<form method="post" action="?/updateInstagram" use:enhance class="flex items-start gap-3">
				<AtSign class="text-muted-foreground mt-0.5 size-4" />
				<div class="min-w-0 flex-1 space-y-2">
					<Label for="instagram" class="text-sm font-medium">Instagram</Label>
					<div class="flex items-center gap-2">
						<span class="text-muted-foreground text-sm">@</span>
						<Input
							id="instagram"
							name="instagram"
							placeholder="yourhandle"
							autocomplete="off"
							bind:value={instagramInput}
							class="max-w-xs"
						/>
						<Button type="submit" size="sm" variant="outline">Save</Button>
					</div>
					{#if form?.instagramError}
						<p class="text-destructive text-xs">{form.instagramError}</p>
					{:else if form?.instagramOk}
						<p class="text-muted-foreground text-xs">
							{form.instagram ? `Saved as @${form.instagram}.` : 'Cleared.'}
						</p>
					{:else}
						<p class="text-muted-foreground text-xs">
							Optional. Shown on your profile so taste-twins can find you.
						</p>
					{/if}
				</div>
			</form>

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

			<!-- API tokens -->
			<div class="flex items-start gap-3">
				<KeyRound class="text-muted-foreground mt-0.5 size-4" />
				<div class="min-w-0 flex-1">
					<div class="text-sm font-medium">API tokens</div>
					<p class="text-muted-foreground mt-1 text-sm">
						Your taste is yours. Create a token to pull your likes and location from
						<code class="text-xs">GET /api/v1/me</code> and plug them into other services.
					</p>

					{#if form?.tokenCreated}
						<div class="bg-muted mt-3 rounded-lg border p-3">
							<p class="text-xs font-medium">New token — copy it now, it won't be shown again.</p>
							<div class="mt-2 flex items-center gap-2">
								<code class="bg-background min-w-0 flex-1 truncate rounded border px-2 py-1 text-xs">
									{form.tokenCreated}
								</code>
								<Button
									type="button"
									size="sm"
									variant="outline"
									onclick={() => copyToken(form.tokenCreated)}
								>
									<Copy class="size-3.5" />
									{tokenCopied ? 'Copied' : 'Copy'}
								</Button>
							</div>
						</div>
					{/if}

					<form method="post" action="?/createToken" use:enhance class="mt-3 flex items-center gap-2">
						<Input name="name" placeholder="e.g. My recipe app" autocomplete="off" class="max-w-xs" />
						<Button type="submit" size="sm" variant="outline">Create token</Button>
					</form>
					{#if form?.tokenError}
						<p class="text-destructive mt-1 text-xs">{form.tokenError}</p>
					{/if}

					{#if data.apiTokens.length > 0}
						<div class="mt-3 space-y-2">
							{#each data.apiTokens as token (token.id)}
								<div class="flex items-center justify-between gap-2 rounded-lg border px-3 py-2">
									<div class="min-w-0">
										<div class="truncate text-sm font-medium">{token.name}</div>
										<div class="text-muted-foreground text-xs">
											<code>{token.prefix}…</code>
											· {token.lastUsedAt ? 'last used' : 'never used'}
										</div>
									</div>
									<form method="post" action="?/revokeToken" use:enhance>
										<input type="hidden" name="id" value={token.id} />
										<Button
											type="submit"
											size="sm"
											variant="ghost"
											class="text-muted-foreground hover:text-destructive"
										>
											<Trash2 class="size-3.5" />
											Revoke
										</Button>
									</form>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			</div>

			<Separator />

			<div class="flex items-start gap-3">
				<User class="text-muted-foreground mt-0.5 size-4" />
				<div class="min-w-0 flex-1">
					<div class="text-sm font-medium">Coming soon</div>
					<p class="text-muted-foreground text-sm">
						Editing your name, avatar upload, change-password, and account deletion all live here.
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
