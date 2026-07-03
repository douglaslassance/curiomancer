<script lang="ts">
	import MapView from '$lib/components/map-view.svelte';
	import { page } from '$app/state';

	let { data } = $props();
	const signedIn = $derived(!!page.data.user);
	// Deep link from the places list: /map?place=<id> flies to + opens that place.
	const selectPlaceId = $derived(page.url.searchParams.get('place'));
</script>

<!--
  Escape the constrained <main> from the root layout: position the map
  fixed below the header (h-14 = 3.5rem) so it fills the viewport. The
  outer <main> still exists in the DOM but contributes nothing visually
  on this route. Search is now a top-left overlay inside MapView itself.
-->
<div class="fixed inset-x-0 bottom-0 top-14 z-0">
	<MapView
		places={data.places}
		center={data.center}
		likedIds={data.likedIds}
		wantToGoIds={data.wantToGoIds ?? []}
		dislikedIds={data.dislikedIds ?? []}
		seenIds={data.seenIds ?? []}
		{signedIn}
		{selectPlaceId}
		showFilters={signedIn}
	/>
</div>
