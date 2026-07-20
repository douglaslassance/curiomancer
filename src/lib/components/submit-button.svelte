<script lang="ts">
	import { Button, type ButtonProps } from '$lib/components/ui/button';
	import { Loader2 } from '@lucide/svelte';
	import type { Snippet } from 'svelte';

	// A form submit button that shows a spinner and disables itself while its
	// form's action is in flight. Pair with pendingForm(): pass its `submitting`
	// as `pending`. Everything else (class, variant, size, ...) forwards to Button.
	let {
		pending = false,
		pendingLabel,
		disabled = false,
		children,
		...rest
	}: ButtonProps & { pending?: boolean; pendingLabel?: string; children: Snippet } = $props();
</script>

<Button type="submit" disabled={pending || disabled} {...rest}>
	{#if pending}
		<Loader2 class="size-4 animate-spin" />
		{#if pendingLabel}{pendingLabel}{/if}
	{:else}
		{@render children()}
	{/if}
</Button>
