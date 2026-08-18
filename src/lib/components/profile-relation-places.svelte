<script lang="ts">
	import PlaceCard from '$lib/components/place-card.svelte';
	import type { Place, PlaceRelationKind } from '$lib/server/db/schema';

	type TaggedPlace = Place & { kind: PlaceRelationKind };

	let {
		viewer,
		likedPlaces,
		photos = {},
		profileName,
		kind,
		selfEmptyMessage,
		sharedEmptyMessage
	}: {
		viewer: { isSelf: boolean; sharedPlaces: TaggedPlace[] } | null;
		likedPlaces: TaggedPlace[];
		/** Apple Place ID -> photo URL, for the places we have already resolved. */
		photos?: Record<string, string>;
		profileName: string;
		kind: PlaceRelationKind;
		selfEmptyMessage: string;
		sharedEmptyMessage: string;
	} = $props();

	// On your own profile there's no "other party" to compare with, so this
	// shows everything you marked this way. On someone else's, it's mutual-
	// only - places where you both landed on the same stance.
	const baseList = $derived.by(() => {
		if (!viewer) return [];
		const source = viewer.isSelf ? likedPlaces : viewer.sharedPlaces;
		return source.filter((p) => p.kind === kind);
	});
</script>

{#snippet placeCard(p: Place)}
	<PlaceCard place={p} photo={p.externalId ? photos[p.externalId] : undefined} />
{/snippet}

{#if !viewer}
	<div class="text-muted-foreground rounded-xl border border-dashed py-8 text-center text-sm">
		<a href="/sign-in" class="underline">Sign in</a> to see what you and {profileName} have in common.
	</div>
{:else if baseList.length === 0}
	<p class="text-muted-foreground rounded-xl border border-dashed py-8 text-center text-sm">
		{viewer.isSelf ? selfEmptyMessage : sharedEmptyMessage}
	</p>
{:else}
	<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
		{#each baseList as p (p.id)}
			{@render placeCard(p)}
		{/each}
	</div>
{/if}
