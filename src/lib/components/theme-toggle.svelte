<script lang="ts">
	import { Monitor, Moon, Sun } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { theme, type ThemePreference } from '$lib/theme.svelte';

	const options: Array<{ value: ThemePreference; label: string }> = [
		{ value: 'light', label: 'Light' },
		{ value: 'dark', label: 'Dark' },
		{ value: 'system', label: 'System' }
	];
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger>
		{#snippet child({ props })}
			<Button {...props} variant="ghost" size="icon" aria-label="Toggle theme">
				<Sun class="size-4 scale-100 transition-all dark:scale-0" />
				<Moon class="absolute size-4 scale-0 transition-all dark:scale-100" />
			</Button>
		{/snippet}
	</DropdownMenu.Trigger>
	<DropdownMenu.Content align="end">
		{#each options as opt (opt.value)}
			<DropdownMenu.Item onclick={() => theme.set(opt.value)}>
				{#if opt.value === 'light'}
					<Sun class="size-4" />
				{:else if opt.value === 'dark'}
					<Moon class="size-4" />
				{:else}
					<Monitor class="size-4" />
				{/if}
				{opt.label}
				{#if theme.preference === opt.value}
					<span class="ml-auto text-xs opacity-60">✓</span>
				{/if}
			</DropdownMenu.Item>
		{/each}
	</DropdownMenu.Content>
</DropdownMenu.Root>
