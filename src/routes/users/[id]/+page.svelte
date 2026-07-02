<script lang="ts">
	import * as Avatar from '$lib/components/ui/avatar';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import RelationToggle from '$lib/components/relation-toggle.svelte';
	import MatchBadge from '$lib/components/match-badge.svelte';
	import { invalidateAll } from '$app/navigation';
	import {
		ArrowLeft,
		Loader2,
		MapPin,
		MessageCircle,
		ThumbsUp,
		UserPlus,
		UserCheck
	} from '@lucide/svelte';
	import type { Place } from '$lib/server/db/schema';

	let { data } = $props();
	const profile = $derived(data.profile);
	const initials = $derived(
		profile.name
			.split(/\s+/)
			.filter(Boolean)
			.slice(0, 2)
			.map((s: string) => s[0]?.toUpperCase() ?? '')
			.join('') || '?'
	);

	let followBusy = $state(false);
	async function toggleFollow() {
		if (!data.viewer || data.viewer.isSelf) return;
		followBusy = true;
		try {
			const res = await fetch(`/api/follow/${profile.id}`, {
				method: data.viewer.following ? 'DELETE' : 'POST'
			});
			if (!res.ok) throw new Error(await res.text().catch(() => `Status ${res.status}`));
			await invalidateAll();
		} catch (err) {
			console.error('Follow toggle failed:', err);
		} finally {
			followBusy = false;
		}
	}
</script>

<!--
  Card snippet - used for both "You both like" and "Everything they like".
  Avoids nesting <button> inside <a> (invalid HTML) by keeping the link
  scoped to the title row and the like button as a sibling.
-->
{#snippet placeCard(p: Place)}
	<article
		class="bg-card hover:border-foreground/30 flex items-start justify-between gap-3 rounded-xl border p-4 transition-colors"
	>
		<a href={`/places/${p.id}`} class="min-w-0 flex-1">
			<div class="flex items-start justify-between gap-2">
				<span class="text-sm font-medium hover:underline">{p.name}</span>
				<Badge variant="secondary" class="capitalize">{p.category}</Badge>
			</div>
			<p class="text-muted-foreground mt-1 text-xs">
				{p.neighborhood ? `${p.neighborhood}, ` : ''}{p.city}
			</p>
		</a>
		<div class="shrink-0">
			<RelationToggle placeId={p.id} />
		</div>
	</article>
{/snippet}

<div class="mx-auto max-w-2xl">
	<Button href="/" variant="ghost" size="sm" class="mb-4">
		<ArrowLeft class="size-4" />
		Back
	</Button>

	<!-- Header: avatar, name, location, match-with-viewer -->
	<header class="mb-8 flex items-start gap-4">
		<Avatar.Root class="size-16">
			{#if profile.image}
				<Avatar.Image src={profile.image} alt={profile.name} />
			{/if}
			<Avatar.Fallback class="text-lg font-medium">{initials}</Avatar.Fallback>
		</Avatar.Root>
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
				{data.likedPlaces.length} liked place{data.likedPlaces.length === 1 ? '' : 's'}
			</p>
		</div>
		{#if data.viewer && !data.viewer.isSelf}
			<div class="flex shrink-0 flex-col items-end gap-2">
				<MatchBadge score={data.viewer.score} />
				<Button
					size="sm"
					variant={data.viewer.following ? 'outline' : 'default'}
					onclick={toggleFollow}
					disabled={followBusy}
				>
					{#if followBusy}
						<Loader2 class="size-4 animate-spin" />
					{:else if data.viewer.following}
						<UserCheck class="size-4" />
						Following
					{:else}
						<UserPlus class="size-4" />
						Follow
					{/if}
				</Button>
				<Button size="sm" variant="outline" href="/pro">
					<MessageCircle class="size-4" />
					Message
				</Button>
			</div>
		{/if}
	</header>

	<!-- Follow graph: who they follow + who follows them -->
	{#snippet peoplePills(people: { id: string; name: string; image: string | null }[])}
		<div class="flex flex-wrap gap-2">
			{#each people as p (p.id)}
				<a
					href={`/users/${p.id}`}
					class="bg-card hover:border-foreground/30 inline-flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-sm transition-colors"
				>
					<Avatar.Root class="size-6">
						{#if p.image}
							<Avatar.Image src={p.image} alt={p.name} />
						{/if}
						<Avatar.Fallback class="text-[10px] font-medium">
							{p.name.slice(0, 1).toUpperCase()}
						</Avatar.Fallback>
					</Avatar.Root>
					<span>{p.name}</span>
				</a>
			{/each}
		</div>
	{/snippet}

	{#if data.following.length > 0 || data.followers.length > 0}
		<div class="mb-8 grid gap-6 sm:grid-cols-2">
			{#if data.following.length > 0}
				<section>
					<h2 class="mb-3 text-lg font-medium">
						Following <span class="text-muted-foreground text-sm font-normal"
							>· {data.following.length}</span
						>
					</h2>
					{@render peoplePills(data.following)}
				</section>
			{/if}
			{#if data.followers.length > 0}
				<section>
					<h2 class="mb-3 text-lg font-medium">
						Followers <span class="text-muted-foreground text-sm font-normal"
							>· {data.followers.length}</span
						>
					</h2>
					{@render peoplePills(data.followers)}
				</section>
			{/if}
		</div>
	{/if}

	<!-- Shared likes with viewer -->
	{#if data.viewer && !data.viewer.isSelf && data.viewer.sharedPlaces.length > 0}
		<section class="mb-8">
			<h2 class="mb-3 text-lg font-medium">You both like</h2>
			<div class="grid gap-3 sm:grid-cols-2">
				{#each data.viewer.sharedPlaces as p (p.id)}
					{@render placeCard(p)}
				{/each}
			</div>
		</section>
	{/if}

	<!-- All their likes -->
	<section>
		<h2 class="mb-3 text-lg font-medium">
			{data.viewer && !data.viewer.isSelf && data.viewer.sharedPlaces.length > 0
				? 'Everything they like'
				: 'Likes'}
		</h2>
		{#if data.likedPlaces.length === 0}
			<p class="text-muted-foreground rounded-xl border border-dashed py-8 text-center text-sm">
				No likes yet.
			</p>
		{:else}
			<div class="grid gap-3 sm:grid-cols-2">
				{#each data.likedPlaces as p (p.id)}
					{@render placeCard(p)}
				{/each}
			</div>
		{/if}
	</section>
</div>
