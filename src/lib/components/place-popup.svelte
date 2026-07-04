<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
	import RelationToggle from './relation-toggle.svelte';
	import AvatarMatch from './avatar-match.svelte';
	import { ExternalLink, Loader2, MapPin, Navigation, ThumbsUp, Users } from '@lucide/svelte';
	import type { Place } from '$lib/server/db/schema';
	import type { MatchedPerson } from '$lib/server/matching';
	import { googleMapsUrl, googleDirectionsUrl } from '$lib/maps-link';
	import { relations } from '$lib/relations.svelte';
	import { page } from '$app/state';
	import { categoryLabel } from '$lib/place-category';

	let {
		placeId,
		onClose,
		// The taste-twin social proof is viewer-relative ("who like *you* likes
		// this"), so it's off when browsing someone else's curated map.
		showSocial = true
	}: {
		placeId: string;
		onClose: () => void;
		showSocial?: boolean;
	} = $props();

	type Context = {
		place: Place;
		likeCount: number;
		likers: MatchedPerson[];
		dislikers: MatchedPerson[];
		seers: MatchedPerson[];
	};

	let context = $state<Context | null>(null);
	let loadError = $state<string | null>(null);

	const signedIn = $derived(!!page.data.user);
	// Likers who aren't taste-twins (or an anonymous viewer's flat list).
	const others = $derived(context?.likers.filter((l) => l.score === 0) ?? []);

	// One contextual taste-twin group: the twins whose take matches yours, or -
	// for a place you haven't rated - the ones who like it (why it surfaced).
	const myKind = $derived(relations.kindOf(placeId));
	const twinSection = $derived.by(() => {
		const twinsOf = (list?: MatchedPerson[]) => list?.filter((l) => l.score > 0) ?? [];
		switch (myKind) {
			case 'disliked':
				return { heading: "They think it's lame", people: twinsOf(context?.dislikers) };
			case 'seen':
				return { heading: "They think it's whatever", people: twinsOf(context?.seers) };
			case 'liked':
				return { heading: 'They like it too', people: twinsOf(context?.likers) };
			default:
				return { heading: 'They like it', people: twinsOf(context?.likers) };
		}
	});

	// Re-fetch context whenever the placeId prop changes - switching pins.
	$effect(() => {
		const id = placeId;
		context = null;
		loadError = null;
		fetch(`/api/places/${id}`)
			.then(async (res) => {
				if (!res.ok) throw new Error(`Server returned ${res.status}`);
				context = (await res.json()) as Context;
			})
			.catch((err) => {
				console.error('Failed to load place context:', err);
				loadError = err instanceof Error ? err.message : 'Could not load.';
			});
	});
</script>

<div
	class="bg-card pointer-events-auto absolute z-10 overflow-y-auto rounded-xl border p-4 shadow-lg
		bottom-4 left-1/2 max-h-[calc(100vh-7rem)] w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2
		sm:bottom-auto sm:left-auto sm:right-4 sm:top-4 sm:max-h-[calc(100vh-6rem)] sm:w-96 sm:translate-x-0"
>
	<button
		type="button"
		class="text-muted-foreground hover:text-foreground absolute right-3 top-3 text-sm"
		onclick={onClose}
		aria-label="Close"
	>
		✕
	</button>

	{#if !context && !loadError}
		<div class="flex items-center gap-2 py-2 text-sm">
			<Loader2 class="text-muted-foreground size-4 animate-spin" />
			<span class="text-muted-foreground">Loading…</span>
		</div>
	{:else if loadError}
		<p class="text-destructive py-2 text-sm">{loadError}</p>
	{:else if context}
		<!-- Header -->
		<div class="pr-6">
			<div class="flex items-start gap-2">
				<h3 class="flex-1 text-sm font-semibold">{context.place.name}</h3>
				<Badge variant="secondary">{categoryLabel(context.place.category)}</Badge>
			</div>
			<p class="text-muted-foreground mt-1 flex items-center gap-1 text-xs">
				<MapPin class="size-3" />
				{context.place.neighborhood
					? `${context.place.neighborhood}, ${context.place.city}`
					: context.place.city}
			</p>
		</div>

		<p class="text-muted-foreground mt-2 text-xs leading-relaxed">{context.place.description}</p>

		<!-- Like + count -->
		<div class="mt-3 flex items-center gap-3">
			<RelationToggle placeId={context.place.id} />
			<span class="text-muted-foreground flex items-center gap-1 text-xs">
				<ThumbsUp class="size-3" />
				{context.likeCount} like{context.likeCount === 1 ? '' : 's'}
			</span>
		</div>

		{#if showSocial}
			{#snippet twinGroup(heading: string, people: MatchedPerson[])}
				<div class="mt-4 border-t pt-3">
					<p class="text-foreground text-xs font-medium">{heading}</p>
					<p class="text-muted-foreground mt-0.5 text-xs">
						{people.length}
						{people.length === 1 ? 'taste-twin' : 'taste-twins'}.
					</p>
					<div class="mt-2 flex gap-2 overflow-x-auto pb-1">
						{#each people as person (person.id)}
							<a
								href={`/users/${person.id}`}
								class="bg-background hover:border-foreground/30 flex w-32 shrink-0 flex-col gap-1.5 rounded-lg border p-2.5 transition-colors"
							>
								<AvatarMatch
									name={person.name}
									image={person.image}
									score={person.score}
									size={38}
								/>
								<div class="truncate text-xs font-medium">{person.name}</div>
							</a>
						{/each}
					</div>
				</div>
			{/snippet}

			<!-- Taste-twins whose take on this place matches yours. -->
			{#if signedIn && twinSection.people.length > 0}
				{@render twinGroup(twinSection.heading, twinSection.people)}
			{/if}

			<!-- Other likers (non-twins or anonymous viewer) -->
			{#if others.length > 0}
				<div class="mt-3 flex flex-wrap gap-1.5">
					{#each others as person (person.id)}
						<a
							href={`/users/${person.id}`}
							class="bg-background hover:border-foreground/30 flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] transition-colors"
						>
							<div
								class="bg-muted flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-medium uppercase"
							>
								{person.name.slice(0, 1)}
							</div>
							{person.name}
						</a>
					{/each}
				</div>
			{/if}

			{#if context.likers.length === 0}
				<p class="text-muted-foreground mt-3 flex items-center gap-1 text-xs">
					<Users class="size-3" />
					Nobody has liked this yet. Be the first.
				</p>
			{/if}
		{/if}

		<!-- Map links pinned to the bottom of the card. -->
		{#if googleDirectionsUrl(context.place) || googleMapsUrl(context.place)}
			<div class="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 border-t pt-3">
				{#if googleDirectionsUrl(context.place)}
					<a
						href={googleDirectionsUrl(context.place)}
						target="_blank"
						rel="noopener noreferrer"
						class="text-foreground inline-flex items-center gap-1 text-xs font-medium underline"
					>
						<Navigation class="size-3" />
						Directions
					</a>
				{/if}
				{#if googleMapsUrl(context.place)}
					<a
						href={googleMapsUrl(context.place)}
						target="_blank"
						rel="noopener noreferrer"
						class="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs underline"
					>
						Open in Google Maps
						<ExternalLink class="size-3" />
					</a>
				{/if}
			</div>
		{/if}
	{/if}
</div>
