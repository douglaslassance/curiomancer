<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { ArrowRight, Sparkles, Users } from '@lucide/svelte';
	import DashboardHeader from '$lib/components/dashboard-header.svelte';
	import LocationPrompt from '$lib/components/location-prompt.svelte';
	import MatchedPeopleRail from '$lib/components/matched-people-rail.svelte';
	import CategoryRail from '$lib/components/category-rail.svelte';
	import EventsRail from '$lib/components/events-rail.svelte';

	let { data } = $props();
</script>

{#if !data.signedIn}
	<!-- ─── Anonymous splash ─────────────────────────────────────────────── -->
	<section class="py-16 text-center">
		<h1 class="text-balance text-4xl font-semibold tracking-tight md:text-5xl">
			Find your people. Find their places.
		</h1>
		<p class="text-muted-foreground mx-auto mt-4 max-w-xl text-balance text-lg">
			Bond cross-references taste so you can discover shops, bars, and restaurants picked by people
			who actually share yours — wherever you happen to be.
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
			<Sparkles class="text-primary size-6" />
			<h2 class="mt-3 text-lg font-medium">Recommendations that travel</h2>
			<p class="text-muted-foreground mt-2 text-sm">
				Love a few spots in LA? Land in Tokyo and Bond surfaces the places loved by the people who
				agree with you in both cities.
			</p>
		</div>
		<div class="bg-card rounded-xl border p-6">
			<Users class="text-primary size-6" />
			<h2 class="mt-3 text-lg font-medium">Taste, not algorithms</h2>
			<p class="text-muted-foreground mt-2 text-sm">
				No engagement bait. Just the overlap between your likes and other humans' — turned into
				recommendations you'd actually act on.
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

	<EventsRail
		title="Events"
		events={data.events}
		timezone={data.location.timezone}
		empty={`No upcoming events in ${data.location.city}.`}
	/>
{/if}
