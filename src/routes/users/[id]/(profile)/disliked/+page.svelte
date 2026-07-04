<script lang="ts">
	import ProfileRelationPlaces from '$lib/components/profile-relation-places.svelte';

	let { data } = $props();
</script>

<ProfileRelationPlaces
	viewer={data.viewer}
	likedPlaces={data.likedPlaces}
	profileName={data.profile.name}
	kind="disliked"
	selfEmptyMessage="No dislikes yet."
	sharedEmptyMessage="You don't have any disliked places in common yet."
/>
