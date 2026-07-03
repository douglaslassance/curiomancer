<script lang="ts">
	import { Bookmark, Eye, ThumbsDown, ThumbsUp } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import { relations, type Kind } from '$lib/relations.svelte';
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';

	let {
		placeId,
		size = 'sm'
	}: {
		placeId: string;
		size?: 'sm' | 'default';
	} = $props();

	const current = $derived(relations.kindOf(placeId));
	const signedIn = $derived(!!page.data.user);

	async function press(kind: Kind, e: Event) {
		e.preventDefault();
		e.stopPropagation();

		const previous = current;
		const next = relations.apply(placeId, kind);

		if (!signedIn) {
			// Anonymous mode: localStorage persists likes only. Roll back
			// other kinds since we don't persist them.
			if (kind !== 'liked') {
				relations.apply(placeId, kind);
			}
			return;
		}

		try {
			// Posting the same kind that was current = clearing it; the store
			// already reflects the desired state. Send the kind being requested
			// - the server interprets it the same way (toggle).
			const res = await fetch('/api/relations', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ placeId, kind })
			});
			if (!res.ok) throw new Error(await res.text());
			await invalidateAll();
		} catch (err) {
			console.error('Failed to set relation:', err);
			// Roll back: re-apply the previous state.
			if (previous) relations.apply(placeId, previous);
			else if (next) relations.apply(placeId, next); // clears
		}
	}
</script>

<div class="inline-flex items-center gap-1">
	<Button
		variant={current === 'liked' ? 'default' : 'outline'}
		{size}
		aria-pressed={current === 'liked'}
		aria-label={current === 'liked' ? 'Unlike' : 'Like'}
		onclick={(e: Event) => press('liked', e)}
	>
		<ThumbsUp class="size-4" />
	</Button>
	<Button
		variant={current === 'seen' ? 'default' : 'outline'}
		{size}
		aria-pressed={current === 'seen'}
		aria-label={current === 'seen'
			? 'Unmark been there'
			: 'Been there, you know it but no strong opinion'}
		onclick={(e: Event) => press('seen', e)}
	>
		<Eye class="size-4" />
	</Button>
	<Button
		variant={current === 'disliked' ? 'default' : 'outline'}
		{size}
		aria-pressed={current === 'disliked'}
		aria-label={current === 'disliked' ? 'Remove dislike' : 'Dislike'}
		onclick={(e: Event) => press('disliked', e)}
	>
		<ThumbsDown class="size-4" />
	</Button>
	<Button
		variant={current === 'want_to_go' ? 'default' : 'outline'}
		{size}
		aria-pressed={current === 'want_to_go'}
		aria-label={current === 'want_to_go'
			? 'Remove from wishlist'
			: "Want to go, haven't been but interested"}
		onclick={(e: Event) => press('want_to_go', e)}
	>
		<Bookmark class="size-4" />
	</Button>
</div>
