<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import * as Avatar from '$lib/components/ui/avatar';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { LogOut, Settings, Shield, User } from '@lucide/svelte';

	let {
		user
	}: {
		user: { name: string; email: string; image?: string | null; role?: string };
	} = $props();

	const isAdmin = $derived(user.role === 'admin');

	const initials = $derived(
		user.name
			.split(/\s+/)
			.filter(Boolean)
			.slice(0, 2)
			.map((s) => s[0]?.toUpperCase() ?? '')
			.join('') || '?'
	);

	let signOutForm: HTMLFormElement | undefined = $state();
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger>
		{#snippet child({ props })}
			<button
				{...props}
				class="focus-visible:ring-ring rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
				aria-label="Open user menu"
			>
				<Avatar.Root class="size-8">
					{#if user.image}
						<Avatar.Image src={user.image} alt={user.name} />
					{/if}
					<Avatar.Fallback class="text-xs font-medium">{initials}</Avatar.Fallback>
				</Avatar.Root>
			</button>
		{/snippet}
	</DropdownMenu.Trigger>
	<DropdownMenu.Content align="end" class="w-56">
		<DropdownMenu.Label class="flex items-start gap-2 font-normal">
			<User class="text-muted-foreground mt-0.5 size-4" />
			<div class="min-w-0 flex-1">
				<div class="truncate text-sm font-medium leading-tight">{user.name}</div>
				<div class="text-muted-foreground truncate text-xs">{user.email}</div>
			</div>
		</DropdownMenu.Label>
		<DropdownMenu.Separator />
		<DropdownMenu.Item onclick={() => goto('/settings')}>
			<Settings class="size-4" />
			Settings
		</DropdownMenu.Item>
		{#if isAdmin}
			<DropdownMenu.Item onclick={() => goto('/admin')}>
				<Shield class="size-4" />
				Admin
			</DropdownMenu.Item>
		{/if}
		<DropdownMenu.Item variant="destructive" onclick={() => signOutForm?.requestSubmit()}>
			<LogOut class="size-4" />
			Sign out
		</DropdownMenu.Item>
	</DropdownMenu.Content>
</DropdownMenu.Root>

<!-- Hidden form so the Sign out menu item can post the action via enhance. -->
<form bind:this={signOutForm} method="post" action="/sign-out" use:enhance class="hidden"></form>
