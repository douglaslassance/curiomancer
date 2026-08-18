<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import * as Tabs from '$lib/components/ui/tabs';
	import {
		BarChart3,
		ClipboardList,
		KeyRound,
		Mail,
		TrendingUp,
		Users
	} from '@lucide/svelte';

	let { children } = $props();

	const tabs = [
		{ href: '/admin', label: 'Overview', icon: BarChart3 },
		{ href: '/admin/metrics', label: 'Growth', icon: TrendingUp },
		{ href: '/admin/users', label: 'Users', icon: Users },
		{ href: '/admin/invites', label: 'Invites', icon: Mail },
		{ href: '/admin/waitlist', label: 'Waitlist', icon: ClipboardList },
		{ href: '/admin/tokens', label: 'Tokens', icon: KeyRound }
	];

	// Match the deepest tab whose href prefixes the current path so nested
	// routes (e.g. /admin/users/123) keep their parent tab highlighted.
	const active = $derived(
		tabs
			.map((t) => t.href)
			.filter((href) => page.url.pathname === href || page.url.pathname.startsWith(`${href}/`))
			.sort((a, b) => b.length - a.length)[0] ?? '/admin'
	);
</script>

<header class="mb-6">
	<Tabs.Root value={active} onValueChange={(v) => goto(v)}>
		<Tabs.List>
			{#each tabs as t (t.href)}
				{@const Icon = t.icon}
				<Tabs.Trigger
					value={t.href}
					onclick={() => {
						// Clicking the already-selected tab does not change the Tabs
						// value, so onValueChange never fires. On a nested route
						// (/admin/users/123 keeps the Users tab lit) that left the tab
						// looking dead instead of returning to the list, so navigate here.
						if (active === t.href && page.url.pathname !== t.href) goto(t.href);
					}}
				>
					<Icon class="size-4" />
					{t.label}
				</Tabs.Trigger>
			{/each}
		</Tabs.List>
	</Tabs.Root>
</header>

{@render children()}
