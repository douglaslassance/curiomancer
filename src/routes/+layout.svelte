<script lang="ts">
	import './layout.css';
	import { invalidateAll } from '$app/navigation';
	import { browser } from '$app/environment';
	import { page } from '$app/state';
	import favicon from '$lib/assets/favicon.svg';
	import {
		MapPin,
		Map as MapIcon,
		MessageCircle,
		Users,
		Shield,
		SlidersHorizontal,
		User,
		VenetianMask
	} from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import { relations } from '$lib/relations.svelte';
	import { theme } from '$lib/theme.svelte';
	import { PLAN_NAME } from '$lib/subscription';
	import posthog from 'posthog-js';

	let { data, children } = $props();

	// Rich-link (Open Graph / Twitter) metadata, emitted once below. Defaults
	// describe the whole app; a page can override by returning
	// `meta: { title, description }` from its load (e.g. /s/[token]).
	const SITE_DESCRIPTION =
		"Discover bars, restaurants, and shops you'll love. Curiomancer matches your taste with people who share it, wherever you are.";
	const metaTitle = $derived(page.data.meta?.title ?? 'Curiomancer');
	const metaDescription = $derived(page.data.meta?.description ?? SITE_DESCRIPTION);

	// Ends an impersonation session (started from /admin/users, dev-only) and
	// restores the original admin's session. Full navigation rather than
	// invalidateAll() - the session cookie itself changed server-side.
	async function stopImpersonating() {
		try {
			const res = await fetch('/api/admin/stop-impersonating', { method: 'POST' });
			if (!res.ok) throw new Error(await res.text().catch(() => `Status ${res.status}`));
			location.href = '/admin/users';
		} catch (err) {
			console.error('Stop impersonating failed:', err);
		}
	}

	// The map routes are full-bleed (fixed overlay), so a footer would sit
	// behind them. Hide it there; show it on every normal page. Covers /places
	// (the main map) and /s/<token> (someone's shared likes map).
	const hideFooter = $derived(
		page.url.pathname === '/places' || page.url.pathname.startsWith('/s/')
	);
	const year = new Date().getFullYear();

	// Highlights the nav item for the current section - pages no longer repeat
	// their own title, so this is the only "you are here" signal. Prefix match
	// so nested routes (e.g. /admin/users) keep their tab highlighted.
	function isActive(href: string): boolean {
		return page.url.pathname === href || page.url.pathname.startsWith(`${href}/`);
	}

	// Plain closure variable (NOT $state) - used only for memoization across
	// effect runs. Making it reactive would cause the effect to re-trigger
	// itself on every assignment, looping forever.
	let lastUserId: string | null = null;

	$effect(() => {
		if (!browser) return;
		if (data.user) {
			posthog.identify(data.user.id, {
				name: data.user.name,
				email: data.user.email
			});
		} else {
			posthog.reset();
		}
	});

	// The stored theme preference only applies while signed in; signed-out
	// visitors always see the system scheme (see theme.svelte.ts).
	$effect(() => {
		theme.setLoggedIn(!!data.user);
	});

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
	<!-- Plain brand title + a real description reads more elegantly as a search
	     result than a compound title. Inner pages can still override both. -->
	<title>Curiomancer</title>
	<meta name="description" content={metaDescription} />
	<!-- Rich link previews (iMessage / Slack / Twitter). One site-wide set; a
	     page overrides the title/description via `meta` from its load. Text only
	     for now - no og:image asset yet. -->
	<meta property="og:title" content={metaTitle} />
	<meta property="og:description" content={metaDescription} />
	<meta property="og:type" content="website" />
	<meta property="og:url" content={`${page.url.origin}${page.url.pathname}`} />
	<meta property="og:site_name" content="Curiomancer" />
	<meta name="twitter:card" content="summary" />
	<meta name="twitter:title" content={metaTitle} />
	<meta name="twitter:description" content={metaDescription} />
	{#if !data.user}
		<!--
			The no-flash script in app.html can't know auth state, so it may apply
			a stored preference left over from a previous signed-in session. Signed
			out visitors should always get the system scheme, so re-correct here
			before paint using data known from the server render.
		-->
		<script>
			(function () {
				try {
					var dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
					document.documentElement.classList.toggle('dark', dark);
					document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
				} catch (_) {
					/* ignore */
				}
			})();
		</script>
	{/if}
</svelte:head>

<div class="bg-background text-foreground flex min-h-screen flex-col">
	<div class="sticky top-0 z-20">
		{#if data.impersonating}
			<div
				class="bg-primary text-primary-foreground flex items-center justify-center gap-3 px-4 py-1.5 text-xs font-medium"
			>
				<VenetianMask class="size-3.5" />
				Impersonating {data.user?.name}. Actions here affect their account.
				<button type="button" class="underline" onclick={stopImpersonating}>
					Stop impersonating
				</button>
			</div>
		{/if}
		<header class="bg-background">
			<div class="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
			<a href="/" class="flex items-center gap-2 font-semibold tracking-tight">
				<MapPin class="size-5" />
				Curiomancer
				<span
					class="bg-muted text-muted-foreground rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide"
				>
					Beta
				</span>
			</a>
			<nav class="flex items-center gap-1">
				{#if data.user}
					<Button
						href="/places"
						variant={isActive('/places') ? 'secondary' : 'ghost'}
						size="sm"
						aria-current={isActive('/places') ? 'page' : undefined}
					>
						<MapIcon class="size-4" />
						Places
					</Button>
					<Button
						href="/people"
						variant={isActive('/people') ? 'secondary' : 'ghost'}
						size="sm"
						aria-current={isActive('/people') ? 'page' : undefined}
					>
						<Users class="size-4" />
						Twins
					</Button>
					<Button
						href="/tune"
						variant={isActive('/tune') ? 'secondary' : 'ghost'}
						size="sm"
						aria-current={isActive('/tune') ? 'page' : undefined}
					>
						<SlidersHorizontal class="size-4" />
						Tune
					</Button>
					{#if data.isSubscriber}
						<Button
							href="/messages"
							variant={isActive('/messages') ? 'secondary' : 'ghost'}
							size="sm"
							aria-current={isActive('/messages') ? 'page' : undefined}
						>
							<MessageCircle class="size-4" />
							Messages
						</Button>
					{/if}
					{#if data.user.role === 'admin'}
						<Button
							href="/admin"
							variant={isActive('/admin') ? 'secondary' : 'ghost'}
							size="sm"
							aria-current={isActive('/admin') ? 'page' : undefined}
						>
							<Shield class="size-4" />
							Admin
						</Button>
					{/if}
					<Button
						href="/settings"
						variant={isActive('/settings') ? 'secondary' : 'ghost'}
						size="sm"
						aria-current={isActive('/settings') ? 'page' : undefined}
					>
						<User class="size-4" />
						Settings
					</Button>
				{:else}
					<Button href="/sign-in" variant="outline" size="sm">Sign in</Button>
				{/if}
			</nav>
		</div>
	</header>
	</div>

	<main class="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-8">
		{@render children()}
	</main>

	{#if !hideFooter}
		<footer>
			<div
				class="text-muted-foreground mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-3 px-4 py-6 text-xs"
			>
				<span>© {year} Curiomancer</span>
				<nav class="flex flex-wrap items-center gap-x-4 gap-y-2">
					<a href="/subscribe" class="hover:text-foreground transition-colors">{PLAN_NAME}</a>
					<a href="/terms" class="hover:text-foreground transition-colors">Terms</a>
					<a href="/privacy" class="hover:text-foreground transition-colors">Privacy</a>
					<a href="/contact" class="hover:text-foreground transition-colors">Contact</a>
				</nav>
			</div>
		</footer>
	{/if}
</div>
