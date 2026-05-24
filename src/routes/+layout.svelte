<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { Heart, Compass, MapPin } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';

	let { children } = $props();
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
				<Button href="/sign-in" variant="outline" size="sm">Sign in</Button>
			</nav>
		</div>
	</header>

	<main class="mx-auto max-w-5xl px-4 py-8">
		{@render children()}
	</main>
</div>
