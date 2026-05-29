<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import RelationToggle from '$lib/components/relation-toggle.svelte';
	import MatchBadge from '$lib/components/match-badge.svelte';
	import { ArrowLeft, ExternalLink, MapPin, ThumbsUp, Users } from '@lucide/svelte';
	import { googleMapsUrl } from '$lib/maps-link';
	import { page } from '$app/state';

	let { data } = $props();
	const p = $derived(data.place);
	const signedIn = $derived(!!page.data.user);

	// Split likers into "taste-twins" (≥1 shared like, score > 0) and
	// "everyone else" so the recommendation rationale is visually distinct
	// from generic social proof.
	const twins = $derived(data.likers.filter((l) => l.score > 0));
	const others = $derived(data.likers.filter((l) => l.score === 0));
</script>

<div class="mx-auto max-w-2xl">
	<Button href="/places" variant="ghost" size="sm" class="mb-4">
		<ArrowLeft class="size-4" />
		Back to discover
	</Button>

	<header class="mb-6">
		<div class="flex items-start justify-between gap-4">
			<div>
				<h1 class="text-3xl font-semibold tracking-tight">{p.name}</h1>
				<p class="text-muted-foreground mt-1 flex items-center gap-1 text-sm">
					<MapPin class="size-4" />
					{p.neighborhood ? `${p.neighborhood}, ` : ''}{p.city}
				</p>
				{#if googleMapsUrl(p)}
					<a
						href={googleMapsUrl(p)}
						target="_blank"
						rel="noopener noreferrer"
						class="text-muted-foreground hover:text-foreground mt-1 inline-flex items-center gap-1 text-sm underline"
					>
						Open in Google Maps
						<ExternalLink class="size-3" />
					</a>
				{/if}
			</div>
			<Badge variant="secondary" class="capitalize">{p.category}</Badge>
		</div>
	</header>

	<p class="text-foreground/90 text-base leading-relaxed">{p.description}</p>

	<div class="mt-6 flex items-center gap-3">
		<RelationToggle placeId={p.id} size="default" />
		<span class="text-muted-foreground flex items-center gap-1 text-sm">
			<ThumbsUp class="size-4" />
			{data.likeCount} like{data.likeCount === 1 ? '' : 's'} total
		</span>
	</div>

	<!-- ─── Why this is recommended ──────────────────────────────────────── -->
	<section class="mt-10">
		{#if signedIn && twins.length > 0}
			<header class="mb-3">
				<h2 class="text-lg font-medium">Why you're seeing this</h2>
				<p class="text-muted-foreground mt-0.5 text-sm">
					{twins.length}
					{twins.length === 1 ? 'person who shares' : 'people who share'} your taste {twins.length ===
					1
						? 'has'
						: 'have'} liked this place.
				</p>
			</header>
			<div class="flex gap-3 overflow-x-auto pb-2">
				{#each twins as person (person.id)}
					<a
						href={`/users/${person.id}`}
						class="bg-card hover:border-foreground/30 flex w-44 shrink-0 flex-col gap-2 rounded-xl border p-4 transition-colors"
					>
						<div
							class="bg-muted flex h-10 w-10 items-center justify-center rounded-full text-sm font-medium uppercase"
						>
							{person.name.slice(0, 1)}
						</div>
						<div class="text-sm font-medium">{person.name}</div>
						<div class="text-muted-foreground text-xs">
							{person.sharedCount} shared like{person.sharedCount === 1 ? '' : 's'}
						</div>
						<div class="mt-1"><MatchBadge score={person.score} /></div>
					</a>
				{/each}
			</div>
		{:else if signedIn && data.likers.length > 0}
			<header class="mb-3">
				<h2 class="text-lg font-medium">Liked by</h2>
				<p class="text-muted-foreground mt-0.5 text-sm">
					Like a few more places to start seeing why a spot was recommended to you.
				</p>
			</header>
		{:else if !signedIn && data.likers.length > 0}
			<header class="mb-3">
				<h2 class="text-lg font-medium">Liked by</h2>
				<p class="text-muted-foreground mt-0.5 text-sm">
					Sign in to see which of these people share your taste.
				</p>
			</header>
		{/if}

		{#if others.length > 0}
			<div class="mt-3 flex flex-wrap gap-2">
				{#each others as person (person.id)}
					<a
						href={`/users/${person.id}`}
						class="bg-card hover:border-foreground/30 flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-colors"
						title={person.name}
					>
						<div
							class="bg-muted flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-medium uppercase"
						>
							{person.name.slice(0, 1)}
						</div>
						{person.name}
					</a>
				{/each}
			</div>
		{/if}

		{#if data.likers.length === 0}
			<p class="text-muted-foreground rounded-xl border border-dashed py-8 text-center text-sm">
				<Users class="mx-auto size-6 opacity-60" />
				<span class="mt-2 block">Nobody has liked this yet. Be the first.</span>
			</p>
		{/if}
	</section>
</div>
