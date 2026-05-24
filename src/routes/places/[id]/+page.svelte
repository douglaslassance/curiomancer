<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import LikeButton from '$lib/components/like-button.svelte';
	import { ArrowLeft, MapPin } from '@lucide/svelte';

	let { data } = $props();
	const p = $derived(data.place);
</script>

<div class="mx-auto max-w-2xl">
	<Button href="/places" variant="ghost" size="sm" class="mb-4">
		<ArrowLeft class="size-4" />
		Back to discover
	</Button>

	<header class="mb-6">
		<div class="flex items-start justify-between gap-4">
			<div>
				<h1 class="text-3xl font-semibold tracking-tight">{p.name}</h1>
				<p class="text-muted-foreground mt-1 flex items-center gap-1 text-sm">
					<MapPin class="size-4" />
					{p.neighborhood ? `${p.neighborhood}, ` : ''}{p.city}
				</p>
			</div>
			<Badge variant="secondary" class="capitalize">{p.category}</Badge>
		</div>
	</header>

	<p class="text-foreground/90 text-base leading-relaxed">{p.description}</p>

	<div class="mt-8">
		<LikeButton placeId={p.id} size="default" />
	</div>
</div>
