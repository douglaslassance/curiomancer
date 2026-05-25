<script lang="ts">
	import { Heart } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import { likes } from '$lib/likes.svelte';
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';

	let { placeId, size = 'sm' }: { placeId: string; size?: 'sm' | 'default' } = $props();

	const liked = $derived(likes.has(placeId));
	const signedIn = $derived(!!page.data.user);

	async function handleClick(e: Event) {
		e.preventDefault();
		e.stopPropagation();

		// Optimistic flip.
		likes.toggle(placeId);

		if (!signedIn) return; // anonymous: localStorage only

		try {
			const body = new FormData();
			body.set('placeId', placeId);
			const res = await fetch('/api/likes/toggle', { method: 'POST', body });
			if (!res.ok) throw new Error(await res.text());
			// Reconcile with server truth.
			await invalidateAll();
		} catch (err) {
			// Roll back the optimistic flip on failure.
			likes.toggle(placeId);
			console.error('Failed to toggle like:', err);
		}
	}
</script>

<Button
	variant={liked ? 'default' : 'outline'}
	{size}
	aria-pressed={liked}
	aria-label={liked ? 'Unlike' : 'Like'}
	onclick={handleClick}
>
	<Heart class="size-4" fill={liked ? 'currentColor' : 'none'} />
	{liked ? 'Liked' : 'Like'}
</Button>
