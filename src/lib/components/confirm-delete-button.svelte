<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import type { Snippet } from 'svelte';

	// A destructive submit button with a two-click confirm built in, so we never
	// depend on the browser's native confirm() dialog (which the user can suppress
	// permanently, silently breaking delete). First click arms; second click
	// within a few seconds submits. Clicking away or waiting disarms.
	let {
		action,
		value,
		name = 'id',
		label,
		confirmLabel = 'Confirm?',
		size = 'sm',
		variant = 'ghost',
		class: className = '',
		icon
	}: {
		action: string;
		value: string;
		name?: string;
		label: string;
		confirmLabel?: string;
		size?: 'sm' | 'default' | 'lg' | 'icon';
		variant?: 'ghost' | 'outline' | 'secondary' | 'destructive' | 'default' | 'link';
		class?: string;
		icon: Snippet;
	} = $props();

	let armed = $state(false);
	let resetTimer: ReturnType<typeof setTimeout> | null = null;

	function disarm() {
		armed = false;
		if (resetTimer) {
			clearTimeout(resetTimer);
			resetTimer = null;
		}
	}

	function onclick(e: MouseEvent) {
		// First click arms and cancels the submit; the armed click falls through
		// and lets the form post.
		if (!armed) {
			e.preventDefault();
			armed = true;
			if (resetTimer) clearTimeout(resetTimer);
			resetTimer = setTimeout(disarm, 3000);
		}
	}
</script>

<form
	method="post"
	{action}
	use:enhance={() => {
		return async ({ update }) => {
			await update();
			disarm();
		};
	}}
>
	<input type="hidden" {name} {value} />
	<Button
		type="submit"
		{size}
		variant={armed ? 'destructive' : variant}
		class={className}
		aria-label={label}
		{onclick}
		onblur={disarm}
	>
		{#if armed}
			{confirmLabel}
		{:else}
			{@render icon()}
		{/if}
	</Button>
</form>
