<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import * as Tabs from '$lib/components/ui/tabs';
	import { BarChart3, ClipboardList, Mail, Users } from '@lucide/svelte';

	let { children } = $props();

	const tabs = [
		{ href: '/admin', label: 'Overview', icon: BarChart3 },
		{ href: '/admin/users', label: 'Users', icon: Users },
		{ href: '/admin/waitlist', label: 'Waitlist', icon: ClipboardList },
		{ href: '/admin/invites', label: 'Invites', icon: Mail }
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
	<h1 class="text-2xl font-semibold tracking-tight">Admin</h1>
	<p class="text-muted-foreground mt-1 text-sm">Internal - visible only to admins.</p>
	<Tabs.Root value={active} onValueChange={(v) => goto(v)} class="mt-4">
		<Tabs.List>
			{#each tabs as t (t.href)}
				{@const Icon = t.icon}
				<Tabs.Trigger value={t.href}>
					<Icon class="size-4" />
					{t.label}
				</Tabs.Trigger>
			{/each}
		</Tabs.List>
	</Tabs.Root>
</header>

{@render children()}
