<script lang="ts">
	import { Bookmark, Eye, ThumbsDown, ThumbsUp } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import { relations, type Kind } from '$lib/relations.svelte';
	import { RELATION_COLOR } from '$lib/relation-colors';
	import type { Component } from 'svelte';
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';

	let {
		placeId,
		size = 'sm'
	}: {
		placeId: string;
		size?: 'sm' | 'default';
	} = $props();

	/**
	 * One entry per rating, so the four buttons stay identical apart from their
	 * kind. Each carries the same colour the rest of the site uses for that
	 * rating (map pins, filter chips, the Tune buttons), from the one palette in
	 * $lib/relation-colors.
	 */
	const OPTIONS: { kind: Kind; icon: Component; on: string; off: string }[] = [
		{ kind: 'liked', icon: ThumbsUp, on: 'Unlike', off: 'Like' },
		{
			kind: 'want_to_go',
			icon: Bookmark,
			on: 'Remove from wishlist',
			off: "Want to go, haven't been but interested"
		},
		{
			kind: 'seen',
			icon: Eye,
			on: 'Unmark been there',
			off: 'Been there, you know it but no strong opinion'
		},
		{ kind: 'disliked', icon: ThumbsDown, on: 'Remove dislike', off: 'Dislike' }
	];

	const current = $derived(relations.kindOf(placeId));
	const signedIn = $derived(!!page.data.user);

	async function press(kind: Kind, e: Event) {
		e.preventDefault();
		e.stopPropagation();

		if (!signedIn) {
			// Rating needs an account. On a shared /s/ map an anonymous viewer can
			// reach these buttons, so send them to sign in (and back) rather than
			// pretending to save something.
			goto(`/sign-in?next=${encodeURIComponent(page.url.pathname)}`);
			return;
		}

		const previous = current;
		const next = relations.apply(placeId, kind);

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
	{#each OPTIONS as o (o.kind)}
		{@const active = current === o.kind}
		{@const color = RELATION_COLOR[o.kind]}
		<Button
			variant="outline"
			{size}
			aria-pressed={active}
			aria-label={active ? o.on : o.off}
			onclick={(e: Event) => press(o.kind, e)}
			style={active ? `background-color:${color};border-color:${color};color:#fff` : undefined}
		>
			<!-- Selected fills with the rating's colour and turns the icon white;
			     unselected leaves the button neutral and colours only the icon, so a
			     row of four reads as four distinct ratings either way. -->
			<o.icon class="size-4" style={active ? undefined : `color:${color}`} />
		</Button>
	{/each}
</div>
