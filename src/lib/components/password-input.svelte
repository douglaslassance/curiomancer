<script lang="ts">
	import { Eye, EyeOff } from '@lucide/svelte';
	import type { HTMLInputAttributes } from 'svelte/elements';
	import { Input } from '$lib/components/ui/input';
	import { cn } from '$lib/utils.js';

	// A password field with a show/hide toggle. Wraps the shared Input and flips
	// its type between "password" and "text"; every other attribute (id, name,
	// required, minlength, autocomplete, …) forwards through, so it drops in
	// wherever a plain password Input was used.
	let {
		value = $bindable(''),
		class: className,
		...restProps
	}: Omit<HTMLInputAttributes, 'type' | 'files'> & { value?: string; class?: string } = $props();

	let revealed = $state(false);
</script>

<div class="relative">
	<Input
		{...restProps}
		type={revealed ? 'text' : 'password'}
		bind:value
		class={cn('pr-9', className)}
	/>
	<button
		type="button"
		onclick={() => (revealed = !revealed)}
		class="text-muted-foreground hover:text-foreground absolute inset-y-0 right-0 flex items-center pr-2.5 outline-none"
		aria-label={revealed ? 'Hide password' : 'Show password'}
		aria-pressed={revealed}
	>
		{#if revealed}
			<EyeOff class="size-4" />
		{:else}
			<Eye class="size-4" />
		{/if}
	</button>
</div>
