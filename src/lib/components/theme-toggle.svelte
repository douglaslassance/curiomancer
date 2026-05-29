<script lang="ts">
	import { Moon, Sun } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import { theme } from '$lib/theme.svelte';
</script>

<Button
	variant="ghost"
	size="icon"
	aria-label={theme.current === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
	onclick={() => theme.toggle()}
>
	<Sun class="size-4 scale-100 transition-all dark:scale-0" />
	<Moon class="absolute size-4 scale-0 transition-all dark:scale-100" />
</Button>
