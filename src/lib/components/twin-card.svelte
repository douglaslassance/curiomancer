<script lang="ts">
	import ScoreBorder from './score-border.svelte';
	import UserPortrait from './user-portrait.svelte';

	/**
	 * One taste-twin, as a card. Shared by the people list, the home twins rail,
	 * and the "shared twins" tab on a profile so the three can't drift.
	 *
	 *
	 * Location is optional because the callers know different things: the people
	 * list is radius-scoped and has a city and a distance, while `getSharedTwins`
	 * answers "who do we both match with" and has no geography in it at all.
	 *
	 * The match score frames the card rather than ringing the portrait, the same
	 * frame recommended place cards use.
	 */
	let {
		id,
		name,
		image = null,
		score,
		sharedCount = 0,
		city = null,
		distanceKm = null
	}: {
		id: string;
		name: string;
		image?: string | null;
		/** Signed similarity, -1..1, or null when there is no signal. */
		score: number | null;
		sharedCount?: number;
		city?: string | null;
		distanceKm?: number | null;
	} = $props();
</script>

<a
	href={`/users/${id}`}
	class="bg-card hover:border-foreground/30 relative flex items-center gap-4 rounded-xl border p-5 transition-colors hover:shadow-sm"
>
	<ScoreBorder {score} />

	<UserPortrait {name} {image} size={72} />

	<div class="flex min-w-0 flex-1 flex-col gap-0.5">
		<div class="truncate font-semibold">{name}</div>
		{#if city}
			<div class="text-muted-foreground truncate text-xs">
				{city}{distanceKm !== null ? ` · ${Math.round(distanceKm)} km away` : ''}
			</div>
		{/if}
		{#if sharedCount > 0}
			<div class="text-muted-foreground text-xs">
				{sharedCount}
				{sharedCount === 1 ? 'place' : 'places'} in common
			</div>
		{/if}
	</div>
</a>
