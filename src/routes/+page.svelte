<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { ArrowRight, MessageCircle, Plane, ShieldCheck, Sparkles } from '@lucide/svelte';
	import DashboardHeader from '$lib/components/dashboard-header.svelte';
	import LocationPrompt from '$lib/components/location-prompt.svelte';
	import MatchedPeopleRail from '$lib/components/matched-people-rail.svelte';
	import CategoryRail from '$lib/components/category-rail.svelte';

	let { data } = $props();
</script>

{#if !data.signedIn}
	<!-- ─── Anonymous splash ─────────────────────────────────────────────── -->
	<section class="py-16 text-center">
		<h1 class="text-balance text-4xl font-semibold tracking-tight md:text-5xl">
			Let your taste guide you
		</h1>
		<p class="text-muted-foreground mx-auto mt-4 max-w-xl text-balance text-lg">
			Curiomancer cross-references your taste to surface the places — and people — worth your
			time, wherever you are or wherever you go.
		</p>
		<div class="mt-8 flex justify-center gap-3">
			<Button href="/sign-up" size="lg">
				Create account
				<ArrowRight class="size-4" />
			</Button>
			<Button href="/sign-in" variant="outline" size="lg">Sign in</Button>
		</div>
	</section>

	<section class="grid gap-6 py-12 md:grid-cols-2">
		<div class="bg-card rounded-xl border p-6">
			<Plane class="text-primary size-6" />
			<h2 class="mt-3 text-lg font-medium">Recommendations that travel</h2>
			<p class="text-muted-foreground mt-2 text-sm">
				Love a handful of spots back home? Whether you land in Tokyo or pull off the highway in
				the middle of nowhere, Curiomancer surfaces the places loved by people who share your
				taste — right where the big apps leave you guessing.
			</p>
		</div>
		<div class="bg-card rounded-xl border p-6">
			<Sparkles class="text-primary size-6" />
			<h2 class="mt-3 text-lg font-medium">Just taste, no algorithm</h2>
			<p class="text-muted-foreground mt-2 text-sm">
				No engagement bait, no ranking games. Curiomancer finds the overlap between your taste and
				other people's — and turns it into recommendations you'd actually act on.
			</p>
		</div>
		<div class="bg-card rounded-xl border p-6">
			<ShieldCheck class="text-primary size-6" />
			<h2 class="mt-3 text-lg font-medium">No data trap</h2>
			<p class="text-muted-foreground mt-2 text-sm">
				Your taste belongs to you. Take it anywhere — it's available through our open API to
				connect with the other services you use.
			</p>
		</div>
		<div class="bg-card rounded-xl border p-6">
			<div class="flex items-center gap-2">
				<MessageCircle class="text-primary size-6" />
				<Badge variant="secondary">Pro</Badge>
			</div>
			<h2 class="mt-3 text-lg font-medium">Expand your network</h2>
			<p class="text-muted-foreground mt-2 text-sm">
				Reach the people who think like you. Message your taste-twins and trade the spots that
				never make a list.
			</p>
		</div>
	</section>
{:else if !data.location}
	<!-- ─── Signed-in but no location yet ─────────────────────────────────── -->
	<div class="py-12">
		<LocationPrompt />
	</div>
{:else}
	<!-- ─── Dashboard ─────────────────────────────────────────────────────── -->
	<DashboardHeader location={data.location} weather={data.weather} />

	<MatchedPeopleRail people={data.matchedPeople} />

	<CategoryRail
		title="Restaurants"
		places={data.restaurants}
		empty={`No restaurants in ${data.location.city} yet.`}
		showMatch={data.myLikeCount > 0}
	/>

	<CategoryRail
		title="Bars"
		places={data.bars}
		empty={`No bars in ${data.location.city} yet.`}
		showMatch={data.myLikeCount > 0}
	/>

	<CategoryRail
		title="Shops"
		places={data.shops}
		empty={`No shops in ${data.location.city} yet.`}
		showMatch={data.myLikeCount > 0}
	/>
{/if}
