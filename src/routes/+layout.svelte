<script lang="ts">
	import './layout.css';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import favicon from '$lib/assets/favicon.svg';
	import { Heart, Compass, MapPin, LogOut } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import { likes } from '$lib/likes.svelte';

	let { data, children } = $props();

	let lastUserId = $state<string | null>(null);

	// Sync the client-side likes store with the server's view of likes.
	// On a fresh sign-in, drain any anonymous localStorage likes into the DB.
	$effect(() => {
		const currentId = data.user?.id ?? null;
		const isNewSignIn = currentId && currentId !== lastUserId;
		lastUserId = currentId;

		if (!data.user) {
			likes.hydrate(likes.ids, false); // back to local mode
			return;
		}

		if (isNewSignIn) {
			const anon = likes.takeAnonymous();
			if (anon.length > 0) {
				fetch('/api/likes/merge', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ placeIds: anon })
				})
					.then(() => invalidateAll())
					.catch((err) => console.error('Failed to merge anonymous likes:', err));
				return;
			}
		}

		likes.hydrate(data.likedIds, true);
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Bond — taste-matched places</title>
</svelte:head>

<div class="bg-background text-foreground min-h-screen">
	<header class="border-border/60 sticky top-0 z-10 border-b backdrop-blur">
		<div class="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
			<a href="/" class="flex items-center gap-2 font-semibold tracking-tight">
				<MapPin class="size-5" />
				Bond
			</a>
			<nav class="flex items-center gap-1">
				<Button href="/places" variant="ghost" size="sm">
					<Compass class="size-4" />
					Discover
				</Button>
				<Button href="/likes" variant="ghost" size="sm">
					<Heart class="size-4" />
					Likes
				</Button>
				{#if data.user}
					<span class="text-muted-foreground hidden text-sm sm:inline">
						Hi, {data.user.name.split(' ')[0]}
					</span>
					<form method="post" action="/sign-out" use:enhance class="contents">
						<Button type="submit" variant="outline" size="sm">
							<LogOut class="size-4" />
							Sign out
						</Button>
					</form>
				{:else}
					<Button href="/sign-in" variant="outline" size="sm">Sign in</Button>
				{/if}
			</nav>
		</div>
	</header>

	<main class="mx-auto max-w-5xl px-4 py-8">
		{@render children()}
	</main>
</div>
