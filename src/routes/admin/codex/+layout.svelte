<script lang="ts">
	import { page } from '$app/state';
	import { MapPin, Sparkles, Users } from '@lucide/svelte';

	let { children } = $props();

	const sections = [
		{ href: '/admin/codex', label: 'Tune', icon: MapPin },
		{ href: '/admin/codex/match', label: 'Match', icon: Sparkles },
		{ href: '/admin/codex/twins', label: 'Twins', icon: Users }
	];
</script>

<svelte:head>
	<title>Admin · Codex · Curiomancer</title>
</svelte:head>

<div class="flex flex-col gap-8 md:flex-row">
	<!-- Sidebar: one page per section. -->
	<nav class="md:w-40 md:shrink-0">
		<div class="flex gap-1 overflow-x-auto md:sticky md:top-6 md:flex-col">
			{#each sections as s (s.href)}
				{@const Icon = s.icon}
				{@const active = page.url.pathname === s.href}
				<a
					href={s.href}
					aria-current={active ? 'page' : undefined}
					class="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors {active
						? 'bg-muted text-foreground'
						: 'text-muted-foreground hover:bg-muted hover:text-foreground'}"
				>
					<Icon class="size-4" />
					{s.label}
				</a>
			{/each}
		</div>
	</nav>

	<!-- Content -->
	<div class="flex min-w-0 max-w-2xl flex-1 flex-col gap-6">
		{@render children()}
	</div>
</div>
