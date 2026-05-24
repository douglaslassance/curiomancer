<script lang="ts">
	import { Heart } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import { likes } from '$lib/likes.svelte';

	let { placeId, size = 'sm' }: { placeId: string; size?: 'sm' | 'default' } = $props();

	const liked = $derived(likes.has(placeId));
</script>

<Button
	variant={liked ? 'default' : 'outline'}
	{size}
	aria-pressed={liked}
	aria-label={liked ? 'Unlike' : 'Like'}
	onclick={(e) => {
		e.preventDefault();
		e.stopPropagation();
		likes.toggle(placeId);
	}}
>
	<Heart class="size-4" fill={liked ? 'currentColor' : 'none'} />
	{liked ? 'Liked' : 'Like'}
</Button>
