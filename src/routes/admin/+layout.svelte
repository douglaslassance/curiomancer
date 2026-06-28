<script lang="ts">
	import { page } from '$app/state';
	import { Button } from '$lib/components/ui/button';
	import { BarChart3, ClipboardList, Users } from '@lucide/svelte';

	let { children } = $props();

	const tabs = [
		{ href: '/admin', label: 'Overview', icon: BarChart3 },
		{ href: '/admin/users', label: 'Users', icon: Users },
		{ href: '/admin/waitlist', label: 'Waitlist', icon: ClipboardList }
	];
</script>

<header class="mb-6">
	<h1 class="text-2xl font-semibold tracking-tight">Admin</h1>
	<p class="text-muted-foreground mt-1 text-sm">Internal - visible only to admins.</p>
	<nav class="mt-4 flex gap-1 border-b">
		{#each tabs as t (t.href)}
			{@const Icon = t.icon}
			{@const active = page.url.pathname === t.href}
			<Button
				href={t.href}
				variant="ghost"
				size="sm"
				class={active ? 'border-foreground rounded-none border-b-2' : 'rounded-none'}
			>
				<Icon class="size-4" />
				{t.label}
			</Button>
		{/each}
	</nav>
</header>

{@render children()}
