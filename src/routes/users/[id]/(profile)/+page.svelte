<script lang="ts">
	import ProfileRelationPlaces from '$lib/components/profile-relation-places.svelte';

	let { data } = $props();
</script>

<ProfileRelationPlaces
	viewer={data.viewer}
	likedPlaces={data.likedPlaces}
	profileName={data.profile.name}
	kind="liked"
	selfEmptyMessage="No likes yet."
	sharedEmptyMessage="You don't have any liked places in common yet."
/>
