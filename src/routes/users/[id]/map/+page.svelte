<script lang="ts">
	import MapView from '$lib/components/map-view.svelte';

	let { data } = $props();
</script>

<svelte:head>
	<title>{data.profile.name}'s likes · Curiomancer</title>
</svelte:head>

<!-- Full-bleed, same trick as /map: escape the constrained <main> and fill
     the viewport below the header. -->
<div class="fixed inset-x-0 bottom-0 top-14 z-0">
	<div class="absolute left-4 top-4 z-20">
		<span
			class="bg-background/90 inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium shadow-sm backdrop-blur-sm"
		>
			{data.profile.name}'s likes
		</span>
	</div>
	<MapView
		places={data.places}
		center={data.center}
		likedIds={data.likedIds}
		wantToGoIds={data.wantToGoIds}
		dislikedIds={data.dislikedIds}
		seenIds={data.seenIds}
		recommendedScores={data.recommendedScores}
		signedIn
		showSearch={false}
		showFilters={false}
		showCategoryFilter
		defaultFilters={{ recommended: true, liked: true, wantToGo: true, disliked: true, seen: true }}
	/>
</div>
