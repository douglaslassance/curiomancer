<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { ArrowRight, Luggage, MessageCircle, ShieldCheck, Sparkles } from '@lucide/svelte';
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
			Curiomancer cross-references your taste to surface the places and people worth your time,
			wherever you are or wherever you go.
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
			<div class="flex items-center gap-2">
				<Luggage class="text-primary size-5" />
				<h2 class="text-lg font-medium">Recommendations that travel</h2>
			</div>
			<p class="text-muted-foreground mt-2 text-sm">
				Love a handful of spots back home? Whether you land in Tokyo or pull off the highway in
				the middle of nowhere, Curiomancer surfaces the places loved by people who share your
				taste, right where the big apps leave you guessing.
			</p>
		</div>
		<div class="bg-card rounded-xl border p-6">
			<div class="flex items-center gap-2">
				<Sparkles class="text-primary size-5" />
				<h2 class="text-lg font-medium">Nothing but taste</h2>
			</div>
			<p class="text-muted-foreground mt-2 text-sm">
				No ads, no engagement bait, no pay-to-rank. What you see is decided by one thing only:
				how much your taste overlaps with other people's.
			</p>
		</div>
		<div class="bg-card rounded-xl border p-6">
			<div class="flex items-center gap-2">
				<ShieldCheck class="text-primary size-5" />
				<h2 class="text-lg font-medium">No data trap</h2>
			</div>
			<p class="text-muted-foreground mt-2 text-sm">
				Your taste belongs to you, available through our open API to connect with the other
				services you use.
			</p>
		</div>
		<div class="bg-card relative rounded-xl border p-6">
			<span
				class="bg-primary text-primary-foreground absolute right-4 top-4 rounded-full px-2 py-0.5 text-xs font-medium"
			>
				Pro
			</span>
			<div class="flex items-center gap-2">
				<MessageCircle class="text-primary size-5" />
				<h2 class="text-lg font-medium">Expand your network</h2>
			</div>
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
