<script lang="ts">
	import './layout.css';
	import { invalidateAll } from '$app/navigation';
	import favicon from '$lib/assets/favicon.svg';
	import { MapPin, Map as MapIcon, Store, Users } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import ThemeToggle from '$lib/components/theme-toggle.svelte';
	import UserMenu from '$lib/components/user-menu.svelte';
	import { relations } from '$lib/relations.svelte';

	let { data, children } = $props();

	// Plain closure variable (NOT $state) — used only for memoization across
	// effect runs. Making it reactive would cause the effect to re-trigger
	// itself on every assignment, looping forever.
	let lastUserId: string | null = null;

	// Sync the client-side relations store with the server's view.
	// On a fresh sign-in, drain any anonymous localStorage likes into the DB.
	$effect(() => {
		const currentId = data.user?.id ?? null;
		const isNewSignIn = currentId !== null && currentId !== lastUserId;
		lastUserId = currentId;

		if (!data.user) {
			relations.resetToAnonymous();
			return;
		}

		if (isNewSignIn) {
			const anon = relations.takeAnonymousLikes();
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

		relations.hydrateFromServer({
			liked: data.likedIds,
			disliked: data.dislikedIds ?? [],
			seen: data.seenIds ?? [],
			wantToGo: data.wantToGoIds ?? []
		});
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Curiomancer — taste-matched places</title>
</svelte:head>

<div class="bg-background text-foreground min-h-screen">
	<header class="border-border/60 sticky top-0 z-10 border-b backdrop-blur">
		<div class="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
			<a href="/" class="flex items-center gap-2 font-semibold tracking-tight">
				<MapPin class="size-5" />
				Curiomancer
			</a>
			<nav class="flex items-center gap-1">
				<Button href="/map" variant="ghost" size="sm">
					<MapIcon class="size-4" />
					Map
				</Button>
				<Button href="/places" variant="ghost" size="sm">
					<Store class="size-4" />
					Places
				</Button>
				<Button href="/people" variant="ghost" size="sm">
					<Users class="size-4" />
					People
				</Button>
				<ThemeToggle />
				{#if data.user}
					<UserMenu user={data.user} />
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
