<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import { Shapes } from '@lucide/svelte';
	import { categoryIcon, categoryLabel } from '$lib/place-category';
	import { CURATED_CATEGORIES } from '$lib/map-category';

	let { data } = $props();
	const v = $derived(data.vocabulary);

	const OtherIcon = categoryIcon('other');

	// What each bucket is for, in product terms.
	const BLURB: Record<string, string> = {
		eat: 'Somewhere you sit down and eat, from a bakery counter to a full restaurant.',
		drink: 'Somewhere you go for a drink, whether that is a wine bar, a brewery, or a night out.',
		shop: 'Somewhere you buy things, including food markets and general stores.',
		visit: 'Somewhere you go and spend time. Culture and entertainment venues, not open geography.'
	};
</script>

<svelte:head>
	<title>Admin · Codex · Categories · Curiomancer</title>
</svelte:head>

<div class="flex flex-col gap-4">
	<div>
		<h2 class="flex items-center gap-2 text-lg font-semibold">
			<Shapes class="size-5" /> Categories
		</h2>
		<p class="text-muted-foreground mt-1 text-sm">
			Every place is filed under one category. It decides the pin glyph, the map's type filter, and
			whether <a href="/admin/codex" class="underline underline-offset-2">Tune</a> will ever offer
			the place.
		</p>
	</div>

	<Card.Root>
		<Card.Content class="flex flex-col gap-3 text-sm">
			<p class="text-muted-foreground">
				You can rate <strong>anything Apple Maps can show</strong>, including a university, a
				hospital, or a park. What you cannot do is have
				<a href="/admin/codex" class="underline underline-offset-2">Tune</a> ask you about them. The
				four curated categories below are what the product is about, and Tune only ever queues those.
			</p>
			<p class="text-muted-foreground">
				Categories come from Apple's own point-of-interest vocabulary. Each Apple category maps to
				exactly one of ours; anything unmapped falls to <strong>Other</strong>.
			</p>
			<p class="text-muted-foreground">
				The lists below are read live from <code>map-category.ts</code>, which is also what
				<code>/api/v1/map-config</code> serves to the iOS and Android apps, so this page, the web map,
				and both native maps can't disagree.
			</p>
		</Card.Content>
	</Card.Root>

	{#each CURATED_CATEGORIES as key (key)}
		{@const Icon = categoryIcon(key)}
		<Card.Root>
			<Card.Header>
				<Card.Title class="flex items-center gap-2 text-base">
					<Icon class="size-4" />
					{categoryLabel(key)}
					{#if categoryLabel(key).toLowerCase() !== key}
						<Badge variant="secondary" class="font-mono text-xs">{key}</Badge>
					{/if}
				</Card.Title>
			</Card.Header>
			<Card.Content class="flex flex-col gap-3 text-sm">
				<p class="text-muted-foreground">{BLURB[key]}</p>
				<div class="flex flex-wrap gap-1">
					{#each v.categories[key] as apple (apple)}
						<Badge variant="outline" class="font-mono text-xs font-normal">{apple}</Badge>
					{/each}
				</div>
			</Card.Content>
		</Card.Root>
	{/each}

	<Card.Root>
		<Card.Header>
			<Card.Title class="flex items-center gap-2 text-base">
				<OtherIcon class="size-4" />
				Other
			</Card.Title>
		</Card.Header>
		<Card.Content class="flex flex-col gap-3 text-sm">
			<p class="text-muted-foreground">
				Everything else Apple can show. A university, a hospital, a police station, a park. These are
				rate-able and they appear on your map with a neutral pin, but
				<a href="/admin/codex" class="underline underline-offset-2">Tune</a> never queues them and
				they never surface as recommendations.
			</p>
			<p class="text-muted-foreground">
				There is no membership list. Other is the fallback for any Apple category not claimed above,
				so it stays correct as Apple adds new ones.
			</p>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title class="text-base">Hidden on the map</Card.Title>
		</Card.Header>
		<Card.Content class="flex flex-col gap-3 text-sm">
			{#if v.hiddenPois.length}
				<p class="text-muted-foreground">
					Apple categories the maps don't draw at all. Hidden means you can't tap or rate them, so
					this list stays deliberately short.
				</p>
				<div class="flex flex-wrap gap-1">
					{#each v.hiddenPois as apple (apple)}
						<Badge variant="outline" class="font-mono text-xs font-normal">{apple}</Badge>
					{/each}
				</div>
			{:else}
				<p class="text-muted-foreground">
					Nothing is hidden. Every point of interest Apple draws is visible and rate-able. The list
					is still wired through <code>/api/v1/map-config</code>, so hiding a category is a
					server-side change that reaches the web and both apps on the next map load, with no client
					release.
				</p>
			{/if}
		</Card.Content>
	</Card.Root>
</div>
