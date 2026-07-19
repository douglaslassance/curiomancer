<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import { ChevronRight, FileText, MapPin } from '@lucide/svelte';

	// Each entry is one import method. Add more here as we support them.
	const methods = [
		{
			href: '/import/native',
			icon: FileText,
			title: 'Curiomancer file',
			description: 'Restore from a JSON file you exported from Settings.'
		},
		{
			href: '/import/google',
			icon: MapPin,
			title: 'Google Maps',
			description: 'Bring in your saved and favorite places from Google Maps.'
		}
	];
</script>

<svelte:head>
	<title>Import ratings · Curiomancer</title>
</svelte:head>

<div class="mx-auto max-w-xl py-8">
	<h1 class="text-2xl font-semibold tracking-tight">Import ratings</h1>
	<p class="text-muted-foreground mt-1 text-sm">Choose where you want to import from.</p>

	<div class="mt-6 flex flex-col gap-3">
		{#each methods as method (method.href)}
			<a href={method.href} class="block">
				<Card.Root class="hover:bg-accent/50 transition-colors">
					<Card.Content class="flex items-center gap-4">
						<method.icon class="text-muted-foreground size-5 shrink-0" />
						<div class="min-w-0 flex-1">
							<p class="font-medium">{method.title}</p>
							<p class="text-muted-foreground text-sm">{method.description}</p>
						</div>
						<ChevronRight class="text-muted-foreground size-4 shrink-0" />
					</Card.Content>
				</Card.Root>
			</a>
		{/each}
	</div>
</div>
