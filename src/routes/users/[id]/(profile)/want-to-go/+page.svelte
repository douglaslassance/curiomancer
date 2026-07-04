<script lang="ts">
	import ProfileRelationPlaces from '$lib/components/profile-relation-places.svelte';

	let { data } = $props();
</script>

<ProfileRelationPlaces
	viewer={data.viewer}
	likedPlaces={data.likedPlaces}
	profileName={data.profile.name}
	kind="want_to_go"
	selfEmptyMessage="Nothing marked want-to-go yet."
	sharedEmptyMessage="You don't have any want-to-go places in common yet."
/>
