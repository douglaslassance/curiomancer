<script lang="ts">
	import * as Avatar from '$lib/components/ui/avatar';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import RelationToggle from '$lib/components/relation-toggle.svelte';
	import AvatarMatch from '$lib/components/avatar-match.svelte';
	import { Input } from '$lib/components/ui/input';
	import { invalidateAll } from '$app/navigation';
	import {
		ArrowLeft,
		Loader2,
		Map,
		MapPin,
		MessageCircle,
		Search,
		ThumbsUp,
		UserPlus,
		UserCheck
	} from '@lucide/svelte';
	import type { Place } from '$lib/server/db/schema';

	let { data } = $props();
	const profile = $derived(data.profile);
	// Only offer the map when they have at least one liked place we can plot.
	const hasMap = $derived(
		data.likedPlaces.some((p) => p.latitude !== null && p.longitude !== null)
	);

	// Search filter over their liked places (same idea as the places page).
	let placeQuery = $state('');
	const filteredLikes = $derived.by(() => {
		const q = placeQuery.trim().toLowerCase();
		if (!q) return data.likedPlaces;
		return data.likedPlaces.filter(
			(p) =>
				p.name.toLowerCase().includes(q) ||
				p.city.toLowerCase().includes(q) ||
				(p.neighborhood?.toLowerCase().includes(q) ?? false)
		);
	});

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
		class="bg-card hover:border-foreground/30 flex flex-col gap-3 rounded-xl border p-4 transition-colors"
	>
		<div class="min-w-0">
			<a href={`/places/${p.id}`} class="text-sm font-medium hover:underline">{p.name}</a>
			<div class="text-muted-foreground mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
				<Badge variant="secondary" class="capitalize">{p.category}</Badge>
				<span>{p.neighborhood ? `${p.neighborhood}, ` : ''}{p.city}</span>
			</div>
		</div>
		<div class="flex justify-end">
			<RelationToggle placeId={p.id} />
		</div>
	</article>
{/snippet}

<div class="mx-auto max-w-2xl">
	<Button href="/" variant="ghost" size="sm" class="mb-4">
		<ArrowLeft class="size-4" />
		Back
	</Button>

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
				{data.likedPlaces.length} liked place{data.likedPlaces.length === 1 ? '' : 's'}
			</p>
		</div>

		<!-- Actions: map is public; follow/message only for a signed-in viewer. -->
		{#if hasMap || (data.viewer && !data.viewer.isSelf)}
			<div class="flex shrink-0 flex-col items-stretch gap-2">
				{#if data.viewer && !data.viewer.isSelf}
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
				{/if}
				{#if hasMap}
					<Button href={`/users/${profile.id}/map`} variant="outline" size="sm">
						<Map class="size-4" />
						See their map
					</Button>
				{/if}
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
		<div class="mb-3 flex items-center justify-between gap-3">
			<h2 class="text-lg font-medium">
				{data.viewer && !data.viewer.isSelf && data.viewer.sharedPlaces.length > 0
					? 'Everything they like'
					: 'Likes'}
			</h2>
			{#if data.likedPlaces.length > 0}
				<div class="relative w-36 sm:w-56">
					<Search class="text-muted-foreground absolute left-2.5 top-1/2 size-4 -translate-y-1/2" />
					<Input
						type="search"
						placeholder="Search…"
						value={placeQuery}
						oninput={(e) => (placeQuery = e.currentTarget.value)}
						class="h-9 pl-8"
					/>
				</div>
			{/if}
		</div>
		{#if data.likedPlaces.length === 0}
			<p class="text-muted-foreground rounded-xl border border-dashed py-8 text-center text-sm">
				No likes yet.
			</p>
		{:else if filteredLikes.length === 0}
			<p class="text-muted-foreground rounded-xl border border-dashed py-8 text-center text-sm">
				No matches for "{placeQuery}".
			</p>
		{:else}
			<div class="grid gap-3 sm:grid-cols-2">
				{#each filteredLikes as p (p.id)}
					{@render placeCard(p)}
				{/each}
			</div>
		{/if}
	</section>
</div>
