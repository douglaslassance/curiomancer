<script lang="ts">
	import MapView from '$lib/components/map-view.svelte';

	let { data } = $props();

	const title = $derived(`${data.profile.name}'s likes`);
</script>

<svelte:head>
	<!-- Just the tab title here; the OG/Twitter preview tags come from the root
	     layout, fed by this route's `meta` (see +page.server.ts). -->
	<title>{title} · Curiomancer</title>
</svelte:head>

<!-- Full-bleed, same trick as /places: escape the constrained <main> and fill
     the viewport below the header. -->
<div class="fixed inset-x-0 bottom-0 top-14 z-0">
	<div class="absolute left-4 top-4 z-20">
		<span
			class="bg-background/90 inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium shadow-sm backdrop-blur-sm"
		>
			{title}
		</span>
	</div>
	<MapView
		places={data.places}
		center={data.center}
		frameAllPlaces={data.frameAllPlaces}
		likedIds={data.likedIds}
		wantToGoIds={data.wantToGoIds}
		dislikedIds={data.dislikedIds}
		seenIds={data.seenIds}
		recommendedScores={data.recommendedScores}
		signedIn={data.signedIn}
		showSearch={false}
		showFilters={false}
		showCategoryFilter
		defaultFilters={{ recommended: true, liked: true, wantToGo: true, disliked: true, seen: true }}
	/>
</div>
