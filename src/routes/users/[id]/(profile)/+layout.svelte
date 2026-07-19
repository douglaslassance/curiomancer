<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import * as Tabs from '$lib/components/ui/tabs';
	import AvatarMatch from '$lib/components/avatar-match.svelte';
	import { PLAN_NAME } from '$lib/subscription';
	import {
		Ban,
		Bookmark,
		Loader2,
		LogOut,
		MapPin,
		MessageCircle,
		Settings,
		Sparkles,
		ThumbsDown,
		ThumbsUp
	} from '@lucide/svelte';

	let { data, children } = $props();
	const profile = $derived(data.profile);
	// Owner-total liked count, computed server-side so the header stays accurate
	// even though a non-owner is no longer sent the full likedPlaces list.
	const likedCount = $derived(data.likedCount);

	// "Shared" only makes sense when comparing against someone else; on your
	// own profile there's no one to share with, so it's just your own list.
	const isSelf = $derived(data.viewer?.isSelf ?? false);
	const tabs = $derived([
		{
			href: `/users/${profile.id}`,
			label: isSelf ? 'Likes' : 'Shared likes',
			icon: ThumbsUp
		},
		{
			href: `/users/${profile.id}/want-to-go`,
			label: isSelf ? 'Want to go' : 'Shared want to go',
			icon: Bookmark
		},
		{
			href: `/users/${profile.id}/disliked`,
			label: isSelf ? 'Disliked' : 'Shared disliked',
			icon: ThumbsDown
		},
		{
			href: `/users/${profile.id}/twins`,
			label: isSelf ? 'Twins' : 'Shared twins',
			icon: Sparkles
		}
	]);

	// Match the deepest tab whose href prefixes the current path (same trick
	// as the admin tabs) so a tab and a route nested under it never both
	// "match" ambiguously - the longer, more specific href wins.
	const active = $derived(
		tabs
			.map((t) => t.href)
			.filter((href) => page.url.pathname === href || page.url.pathname.startsWith(`${href}/`))
			.sort((a, b) => b.length - a.length)[0] ?? `/users/${profile.id}`
	);

	// Blocking is mutual and gates the whole profile (see +layout.server.ts),
	// so there's no "already blocked" state to reflect here - if you'd
	// already blocked them, this page would 404 instead of rendering. Once
	// blocked, this same profile becomes unreachable, so we navigate away.
	let blockBusy = $state(false);
	async function blockThisUser() {
		if (!data.viewer || data.viewer.isSelf) return;
		if (!confirm(`Block ${profile.name}? Neither of you will see each other anymore.`)) return;
		blockBusy = true;
		try {
			const res = await fetch(`/api/block/${profile.id}`, { method: 'POST' });
			if (!res.ok) throw new Error(await res.text().catch(() => `Status ${res.status}`));
			goto('/');
		} catch (err) {
			console.error('Block failed:', err);
			blockBusy = false;
		}
	}
</script>

<div>
	<!-- Header: avatar (ringed with the match score), identity, grouped actions -->
	<header class="mb-8 flex items-start gap-4">
		<AvatarMatch
			name={profile.name}
			image={profile.image}
			score={data.viewer && !data.viewer.isSelf ? data.viewer.score : null}
			size={112}
			showPercent
		/>

		<div class="min-w-0 flex-1">
			<h1 class="text-2xl font-semibold tracking-tight">{profile.name}</h1>
			{#if data.location}
				<p class="text-muted-foreground mt-1 flex items-center gap-1 text-sm">
					<MapPin class="size-4" />
					{data.location.city}{data.location.countryCode ? `, ${data.location.countryCode}` : ''}
				</p>
			{/if}
			<p class="text-muted-foreground mt-1 flex items-center gap-1 text-sm">
				<ThumbsUp class="size-4" />
				{likedCount} liked place{likedCount === 1 ? '' : 's'}
			</p>
		</div>

		<!-- Actions: Settings/Sign out on your own profile, Message/Block on someone else's. -->
		{#if data.viewer}
			<div class="flex shrink-0 flex-col items-stretch gap-2">
				{#if data.viewer?.isSelf}
					<Button size="sm" variant="secondary" href="/settings">
						<Settings class="size-4" />
						Settings
					</Button>
					<form method="post" action="/sign-out" use:enhance class="contents">
						<Button type="submit" size="sm" variant="outline">
							<LogOut class="size-4" />
							Sign out
						</Button>
					</form>
				{:else if data.viewer && !data.viewer.isSelf}
					<!-- You can only reach this profile if you're a (non-incognito) twin,
					     so the Message button always applies; it only gates on whether
					     the viewer subscribes. -->
					{@const canMessage = data.viewer.isSubscriber}
					<Button
						size="sm"
						variant="default"
						href={canMessage ? `/messages/${profile.id}` : '/subscribe'}
						title={canMessage ? undefined : `Get ${PLAN_NAME} to message people`}
					>
						<MessageCircle class="size-4" />
						Message
					</Button>
					<Button
						size="sm"
						variant="outline"
						class="text-muted-foreground hover:text-destructive"
						onclick={blockThisUser}
						disabled={blockBusy}
					>
						{#if blockBusy}
							<Loader2 class="size-4 animate-spin" />
						{:else}
							<Ban class="size-4" />
						{/if}
						Block
					</Button>
				{/if}
			</div>
		{/if}
	</header>

	<Tabs.Root value={active} onValueChange={(v) => goto(v)} class="mb-8">
		<Tabs.List>
			{#each tabs as t (t.href)}
				{@const Icon = t.icon}
				<Tabs.Trigger value={t.href}>
					<Icon class="size-4" />
					{t.label}
				</Tabs.Trigger>
			{/each}
		</Tabs.List>
	</Tabs.Root>

	{@render children()}
</div>
