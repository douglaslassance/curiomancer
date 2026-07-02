<script lang="ts">
	import MapView from '$lib/components/map-view.svelte';
	import * as Avatar from '$lib/components/ui/avatar';
	import { Button } from '$lib/components/ui/button';
	import { ArrowLeft } from '@lucide/svelte';
	import { page } from '$app/state';

	let { data } = $props();
	const signedIn = $derived(!!page.data.user);
	const profile = $derived(data.profile);
	const initials = $derived(profile.name.slice(0, 1).toUpperCase() || '?');
</script>

<!--
  Same full-viewport treatment as /map: fixed below the header (h-14). This is
  a read-only view of someone else's liked places, so the search overlay is
  off (it would save to the viewer's own list, not theirs).
-->
<div class="fixed inset-x-0 bottom-0 top-14 z-0">
	<MapView
		places={data.places}
		center={data.center}
		likedIds={data.likedIds}
		{signedIn}
		showSearch={false}
		showPlaceSocial={false}
	/>

	<!-- Whose map this is, with a way back to their profile. -->
	<div
		class="bg-background/90 absolute left-4 top-4 z-10 flex items-center gap-3 rounded-full border py-1.5 pl-1.5 pr-4 shadow-sm backdrop-blur-sm"
	>
		<Button href={`/users/${profile.id}`} variant="ghost" size="icon" class="size-8 rounded-full">
			<ArrowLeft class="size-4" />
		</Button>
		<Avatar.Root class="size-8">
			{#if profile.image}
				<Avatar.Image src={profile.image} alt={profile.name} />
			{/if}
			<Avatar.Fallback class="text-xs font-medium">{initials}</Avatar.Fallback>
		</Avatar.Root>
		<span class="text-sm font-medium">{profile.name}'s map</span>
	</div>
</div>
