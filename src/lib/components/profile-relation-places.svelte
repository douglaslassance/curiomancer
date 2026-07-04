<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
	import RelationToggle from '$lib/components/relation-toggle.svelte';
	import { categoryLabel } from '$lib/place-category';
	import type { Place, PlaceRelationKind } from '$lib/server/db/schema';

	type TaggedPlace = Place & { kind: PlaceRelationKind };

	let {
		viewer,
		likedPlaces,
		profileName,
		kind,
		selfEmptyMessage,
		sharedEmptyMessage
	}: {
		viewer: { isSelf: boolean; sharedPlaces: TaggedPlace[] } | null;
		likedPlaces: TaggedPlace[];
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
	<article
		class="bg-card hover:border-foreground/30 flex flex-col gap-3 rounded-xl border p-4 transition-colors"
	>
		<div class="min-w-0">
			<a href={`/map?place=${p.id}`} class="text-sm font-medium hover:underline">{p.name}</a>
			<div class="text-muted-foreground mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
				<Badge variant="secondary">{categoryLabel(p.category)}</Badge>
				<span>{p.neighborhood ? `${p.neighborhood}, ` : ''}{p.city}</span>
			</div>
		</div>
		<div class="flex justify-end">
			<RelationToggle placeId={p.id} />
		</div>
	</article>
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
