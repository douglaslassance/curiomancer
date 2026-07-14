<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { page } from '$app/state';
	import { enhance, applyAction } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import * as Avatar from '$lib/components/ui/avatar';
	import * as Card from '$lib/components/ui/card';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Separator } from '$lib/components/ui/separator';
	import { Switch } from '$lib/components/ui/switch';
	import InviteCard from '$lib/components/invite-card.svelte';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import {
		Ban,
		Camera,
		Copy,
		CreditCard,
		Download,
		KeyRound,
		Loader2,
		Lock,
		LogOut,
		Mail,
		MapPin,
		MessageCircle,
		Monitor,
		Moon,
		RefreshCw,
		Share2,
		Sparkles,
		Sun,
		ThumbsUp,
		Trash2,
		User
	} from '@lucide/svelte';
	import { updateLocation, type LocationUpdateError } from '$lib/location-update';
	import { theme, type ThemePreference } from '$lib/theme.svelte';

	const THEME_OPTIONS: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
		{ value: 'system', label: 'System', icon: Monitor },
		{ value: 'light', label: 'Light', icon: Sun },
		{ value: 'dark', label: 'Dark', icon: Moon }
	];

	let { data, form } = $props();

	// Better-auth redirects here after the user clicks the confirmation link in
	// their new inbox; by then data.profile.email is already the new address.
	const emailChanged = $derived(page.url.searchParams.get('emailChanged') === '1');

	// Email field: prefilled with the current address, with the Change button
	// disabled until it's edited to a different, valid address. untrack() seeds
	// the initial value without registering a reactive dependency.
	let emailValue = $state(untrack(() => data.profile.email));
	const emailValid = $derived(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue.trim()));
	const emailDiffers = $derived(
		emailValue.trim().toLowerCase() !== data.profile.email.toLowerCase()
	);

	const subscriptionDateFmt = new Intl.DateTimeFormat('en-US', {
		year: 'numeric',
		month: 'short',
		day: 'numeric'
	});
	function formatPeriodEnd(d: Date | string | null): string {
		return d ? subscriptionDateFmt.format(new Date(d)) : 'the end of the period';
	}

	let portalLoading = $state(false);
	// The portal action redirects to a Stripe-hosted page; goto() can't leave the
	// app, so follow the external redirect with a full navigation.
	const openPortal: SubmitFunction = () => {
		portalLoading = true;
		return async ({ result }) => {
			if (result.type === 'redirect') {
				window.location.href = result.location;
				return;
			}
			portalLoading = false;
			await applyAction(result);
		};
	};

	// Delete account: confirmation dialog + full navigation on the redirect (the
	// session is gone once the row is deleted, so goto() can't be trusted).
	let deleteDialogOpen = $state(false);
	let deletingAccount = $state(false);
	const submitDelete: SubmitFunction = () => {
		deletingAccount = true;
		return async ({ result }) => {
			if (result.type === 'redirect') {
				window.location.href = result.location;
				return;
			}
			deletingAccount = false;
			await applyAction(result);
		};
	};

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

	// Avatar upload: downscale the chosen image to a small square data URI in the
	// browser (keeps it small enough to store on the user row), then submit the
	// hidden form so the server action persists it.
	let avatarInput = $state<HTMLInputElement | null>(null);
	let avatarForm = $state<HTMLFormElement | null>(null);
	let avatarData = $state('');
	let avatarBusy = $state(false);
	let avatarError = $state<string | null>(null);

	function resizeToDataUrl(file: File, size: number): Promise<string> {
		return new Promise((resolve, reject) => {
			const img = new Image();
			const url = URL.createObjectURL(file);
			img.onload = () => {
				URL.revokeObjectURL(url);
				const canvas = document.createElement('canvas');
				canvas.width = size;
				canvas.height = size;
				const ctx = canvas.getContext('2d');
				if (!ctx) return reject(new Error('no 2d context'));
				// Cover-crop to a centered square.
				const scale = Math.max(size / img.width, size / img.height);
				const w = img.width * scale;
				const h = img.height * scale;
				ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
				resolve(canvas.toDataURL('image/jpeg', 0.85));
			};
			img.onerror = () => {
				URL.revokeObjectURL(url);
				reject(new Error('could not load image'));
			};
			img.src = url;
		});
	}

	async function onAvatarPick(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		avatarError = null;
		if (!file.type.startsWith('image/')) {
			avatarError = 'Please choose an image file.';
			return;
		}
		avatarBusy = true;
		try {
			avatarData = await resizeToDataUrl(file, 256);
			// Let Svelte flush avatarData into the hidden input before submitting,
			// otherwise requestSubmit() serializes a stale (empty) value.
			await tick();
			avatarForm?.requestSubmit();
		} catch (err) {
			console.error('Avatar processing failed:', err);
			avatarError = 'Could not process that image.';
			avatarBusy = false;
		} finally {
			// Let the same file be re-picked later.
			input.value = '';
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

	// Viewing the link requires a Curiomancer account - anyone without one
	// lands on /sign-in (which offers sign-up/waitlist) before seeing the map.
	let likesLinkCopied = $state(false);
	async function shareLikes() {
		const url = `${window.location.origin}/users/${data.profile.id}/map`;
		if (navigator.share) {
			try {
				await navigator.share({ title: 'My likes on Curiomancer', url });
				return;
			} catch (err) {
				if ((err as Error)?.name === 'AbortError') return;
			}
		}
		try {
			await navigator.clipboard.writeText(url);
			likesLinkCopied = true;
			setTimeout(() => (likesLinkCopied = false), 2000);
		} catch (err) {
			console.error('Clipboard write failed:', err);
		}
	}

	const initials = $derived(
		data.profile.name
			.split(/\s+/)
			.filter(Boolean)
			.slice(0, 2)
			.map((s: string) => s[0]?.toUpperCase() ?? '')
			.join('') || '?'
	);

	const invitesRemaining = $derived(data.invites.filter((i) => i.redeemedByUserId === null).length);
	const messageable = $derived(form?.messageable ?? data.profile.messageable);
	let messageableForm: HTMLFormElement | undefined;
</script>

<svelte:head>
	<title>Settings · Curiomancer</title>
</svelte:head>

<div class="py-4">
	<Card.Root>
		<Card.Header>
			<div class="flex items-center gap-4">
				<button
					type="button"
					class="group focus-visible:ring-ring relative size-14 shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2"
					disabled={avatarBusy}
					onclick={() => avatarInput?.click()}
					aria-label={data.profile.image ? 'Change photo' : 'Upload photo'}
				>
					<Avatar.Root class="size-14">
						{#if data.profile.image}
							<Avatar.Image src={data.profile.image} alt={data.profile.name} />
						{/if}
						<Avatar.Fallback class="text-base font-medium">{initials}</Avatar.Fallback>
					</Avatar.Root>
					<span
						class="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100 {avatarBusy
							? 'opacity-100'
							: ''}"
					>
						{#if avatarBusy}
							<Loader2 class="size-5 animate-spin" />
						{:else}
							<Camera class="size-5" />
						{/if}
					</span>
				</button>
				<div class="min-w-0">
					<Card.Title class="flex items-center gap-2">
						{data.profile.name}
						{#if data.profile.role === 'admin'}
							<Badge variant="default">Admin</Badge>
						{/if}
					</Card.Title>
					{#if data.profile.image}
						<form method="post" action="?/removeAvatar" use:enhance>
							<button
								type="submit"
								class="text-muted-foreground hover:text-destructive mt-1 text-xs underline"
							>
								Remove photo
							</button>
						</form>
					{/if}
					{#if avatarError}
						<p class="text-destructive mt-1 text-xs">{avatarError}</p>
					{:else if form?.avatarError}
						<p class="text-destructive mt-1 text-xs">{form.avatarError}</p>
					{/if}
				</div>
			</div>
		</Card.Header>
		<Card.Content class="space-y-4">
			{#if emailChanged}
				<div
					class="border-primary/30 bg-primary/5 text-foreground flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
				>
					<Mail class="text-primary size-4 shrink-0" />
					Your email was updated to {data.profile.email}.
				</div>
				<Separator />
			{/if}

			<!-- Display name -->
			<form method="post" action="?/updateName" use:enhance class="flex items-start gap-3">
				<User class="text-muted-foreground mt-0.5 size-4" />
				<div class="min-w-0 flex-1 space-y-2">
					<Label for="name" class="text-sm font-medium">Name</Label>
					<div class="flex items-center gap-2">
						<Input
							id="name"
							name="name"
							placeholder="Your name"
							autocomplete="name"
							value={form?.name ?? data.profile.name}
							class="max-w-xs"
						/>
						<Button type="submit" size="sm" variant="outline">Save</Button>
					</div>
					{#if form?.nameError}
						<p class="text-destructive text-xs">{form.nameError}</p>
					{:else if form?.nameOk}
						<p class="text-muted-foreground text-xs">Saved.</p>
					{:else}
						<p class="text-muted-foreground text-xs">Shown on your profile and to taste-twins.</p>
					{/if}
				</div>
			</form>

			<Separator />

			<!-- Current location -->
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

			<Separator />

			<!-- Email -->
			<form method="post" action="?/updateEmail" use:enhance class="flex items-start gap-3">
				<Mail class="text-muted-foreground mt-0.5 size-4" />
				<div class="min-w-0 flex-1 space-y-2">
					<Label for="email" class="text-sm font-medium">Email</Label>
					<div class="flex items-center gap-2">
						<Input
							id="email"
							name="email"
							type="email"
							placeholder="you@example.com"
							autocomplete="email"
							bind:value={emailValue}
							class="max-w-xs"
						/>
						<Button type="submit" size="sm" variant="outline" disabled={!emailValid || !emailDiffers}>
							Change
						</Button>
					</div>
					{#if form?.emailError}
						<p class="text-destructive text-xs">{form.emailError}</p>
					{:else if form?.emailPending}
						<p class="text-muted-foreground text-xs">
							Check <span class="font-medium">{form.email}</span> for a link to confirm the change.
							Your current email stays until you do.
						</p>
					{:else}
						<p class="text-muted-foreground text-xs">
							We'll email a confirmation link to the new address before switching.
						</p>
					{/if}
				</div>
			</form>

			<Separator />

			<!-- Change password -->
			<form method="post" action="?/changePassword" use:enhance class="flex items-start gap-3">
				<Lock class="text-muted-foreground mt-0.5 size-4" />
				<div class="min-w-0 flex-1 space-y-2">
					<div class="text-sm font-medium">Change password</div>
					<div class="grid max-w-xs gap-2">
						<Input
							type="password"
							name="currentPassword"
							placeholder="Current password"
							autocomplete="current-password"
							required
						/>
						<Input
							type="password"
							name="newPassword"
							placeholder="New password (min 8 characters)"
							autocomplete="new-password"
							required
						/>
						<Button type="submit" size="sm" variant="outline" class="justify-self-start">
							Update password
						</Button>
					</div>
					{#if form?.passwordError}
						<p class="text-destructive text-xs">{form.passwordError}</p>
					{:else if form?.passwordOk}
						<p class="text-muted-foreground text-xs">Password updated.</p>
					{/if}
				</div>
			</form>

			<Separator />

			<div class="flex items-start gap-3">
				<Sun class="text-muted-foreground mt-0.5 size-4" />
				<div class="min-w-0 flex-1">
					<div class="text-sm font-medium">Theme</div>
					<div class="mt-2 inline-flex items-center gap-1">
						{#each THEME_OPTIONS as opt (opt.value)}
							{@const Icon = opt.icon}
							<Button
								type="button"
								size="sm"
								variant={theme.preference === opt.value ? 'default' : 'outline'}
								aria-pressed={theme.preference === opt.value}
								onclick={() => theme.set(opt.value)}
							>
								<Icon class="size-3.5" />
								{opt.label}
							</Button>
						{/each}
					</div>
				</div>
			</div>

			<Separator />

			<div class="flex items-start gap-3">
				<CreditCard class="text-muted-foreground mt-0.5 size-4" />
				<div class="min-w-0 flex-1">
					<div class="flex items-center justify-between gap-2">
						<div class="text-sm font-medium">Subscription</div>
						{#if data.subscription?.canManage}
							<form method="post" action="?/portal" use:enhance={openPortal}>
								<Button type="submit" size="sm" variant="outline" disabled={portalLoading}>
									{#if portalLoading}
										<Loader2 class="size-3.5 animate-spin" />
										Opening…
									{:else}
										Manage
									{/if}
								</Button>
							</form>
						{:else if !data.subscription}
							<Button href="/subscribe" size="sm" variant="outline">Subscribe</Button>
						{/if}
					</div>
					<p class="text-muted-foreground mt-1 text-sm">
						{#if !data.subscription}
							Free plan. Subscribe to message your taste-twins.
						{:else if data.subscription.isComp}
							Complimentary subscription. Thanks for being here.
						{:else if data.subscription.cancelAtPeriodEnd}
							Active. Cancels on {formatPeriodEnd(data.subscription.currentPeriodEnd)}.
						{:else}
							Active. Renews on {formatPeriodEnd(data.subscription.currentPeriodEnd)}.
						{/if}
					</p>
					{#if form?.message}
						<p class="text-destructive mt-1 text-xs">{form.message}</p>
					{/if}
				</div>
			</div>

			<Separator />

			<div class="flex items-start gap-3">
				<MessageCircle class="text-muted-foreground mt-0.5 size-4" />
				<div class="min-w-0 flex-1">
					<div class="flex items-center justify-between gap-2">
						<div class="text-sm font-medium">Allow messages</div>
						<form
							method="post"
							action="?/updateMessageable"
							use:enhance
							bind:this={messageableForm}
						>
							<input type="hidden" name="messageable" value={(!messageable).toString()} />
							<Switch
								checked={messageable}
								onCheckedChange={() => messageableForm?.requestSubmit()}
							/>
						</form>
					</div>
					<p class="text-muted-foreground mt-1 text-sm">
						Subscribed Curiomancer users can start a conversation with you.
					</p>
					{#if form?.messageableError}
						<p class="text-destructive mt-1 text-xs">{form.messageableError}</p>
					{/if}
				</div>
			</div>

			<Separator />

			<!-- Likes: share + import -->
			<div class="flex items-start gap-3">
				<ThumbsUp class="text-muted-foreground mt-0.5 size-4" />
				<div class="min-w-0 flex-1">
					<div class="text-sm font-medium">Likes</div>
					<p class="text-muted-foreground text-sm">
						You've liked {data.likeCount} place{data.likeCount === 1 ? '' : 's'}.
					</p>
					<p class="text-muted-foreground mt-1 text-sm">
						Share a link to your likes on the map, or import your Google Maps saved places
						(favorites become likes, "Want to go" carries across).
					</p>
					<div class="mt-2 flex flex-wrap gap-2">
						<Button type="button" size="sm" variant="outline" onclick={shareLikes}>
							<Share2 class="size-3.5" />
							{likesLinkCopied ? 'Copied' : 'Share'}
						</Button>
						<Button href="/import" size="sm" variant="outline">
							<Download class="size-3.5" />
							Import
						</Button>
					</div>
				</div>
			</div>

			<Separator />

			<!-- Blocked users -->
			<div class="flex items-start gap-3">
				<Ban class="text-muted-foreground mt-0.5 size-4" />
				<div class="min-w-0 flex-1">
					<div class="text-sm font-medium">Blocked</div>
					<p class="text-muted-foreground mt-1 text-sm">
						Blocked people can't see your profile, message you, or show up in your twins - and you
						won't show up in theirs.
					</p>
					{#if data.blockedUsers.length > 0}
						<div class="mt-3 space-y-2">
							{#each data.blockedUsers as blocked (blocked.id)}
								<div class="flex items-center justify-between gap-2 rounded-lg border px-3 py-2">
									<div class="flex min-w-0 items-center gap-2">
										<Avatar.Root class="size-6">
											{#if blocked.image}
												<Avatar.Image src={blocked.image} alt={blocked.name} />
											{/if}
											<Avatar.Fallback class="text-[10px] font-medium">
												{blocked.name.slice(0, 1).toUpperCase()}
											</Avatar.Fallback>
										</Avatar.Root>
										<span class="truncate text-sm">{blocked.name}</span>
									</div>
									<form method="post" action="?/unblockUser" use:enhance>
										<input type="hidden" name="id" value={blocked.id} />
										<Button type="submit" size="sm" variant="ghost">Unblock</Button>
									</form>
								</div>
							{/each}
						</div>
					{:else}
						<p class="text-muted-foreground mt-2 text-xs">You haven't blocked anyone.</p>
					{/if}
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
							<p class="text-xs font-medium">New token. Copy it now, it won't be shown again.</p>
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

					<form
						method="post"
						action="?/createToken"
						use:enhance
						class="mt-3 flex items-center gap-2"
					>
						<Input
							name="name"
							placeholder="e.g. My recipe app"
							autocomplete="off"
							class="max-w-xs"
						/>
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

			<!-- Hidden file picker + form carrying the downscaled data URI. -->
			<input
				bind:this={avatarInput}
				type="file"
				accept="image/*"
				class="hidden"
				onchange={onAvatarPick}
			/>
			<form
				method="post"
				action="?/updateAvatar"
				bind:this={avatarForm}
				class="hidden"
				use:enhance={() =>
					async ({ update }) => {
						await update();
						avatarBusy = false;
					}}
			>
				<input type="hidden" name="image" bind:value={avatarData} />
			</form>
		</Card.Content>
		<Card.Footer class="justify-between">
			<form method="post" action="/sign-out" use:enhance class="contents">
				<Button type="submit" variant="outline">
					<LogOut class="size-4" />
					Sign out
				</Button>
			</form>

			<Button
				variant="ghost"
				class="text-destructive hover:text-destructive"
				onclick={() => (deleteDialogOpen = true)}
			>
				<Trash2 class="size-4" />
				Delete account
			</Button>
		</Card.Footer>
	</Card.Root>

	<Dialog.Root bind:open={deleteDialogOpen}>
		<Dialog.Content>
			<Dialog.Header>
				<Dialog.Title>Delete your account?</Dialog.Title>
				<Dialog.Description>
					This permanently deletes your account, your likes and ratings, and your messages. It
					can't be undone.
				</Dialog.Description>
			</Dialog.Header>
			<Dialog.Footer>
				<Button variant="outline" onclick={() => (deleteDialogOpen = false)}>Cancel</Button>
				<form method="post" action="?/deleteAccount" use:enhance={submitDelete}>
					<Button type="submit" variant="destructive" disabled={deletingAccount}>
						{#if deletingAccount}
							<Loader2 class="size-4 animate-spin" />
							Deleting…
						{:else}
							<Trash2 class="size-4" />
							Delete account
						{/if}
					</Button>
				</form>
			</Dialog.Footer>
		</Dialog.Content>
	</Dialog.Root>
</div>
