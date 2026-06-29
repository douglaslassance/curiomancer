<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { ArrowRight, Check, Loader2, Luggage, MessageCircle, ShieldCheck, Sparkles } from '@lucide/svelte';
	import DashboardHeader from '$lib/components/dashboard-header.svelte';
	import LocationPrompt from '$lib/components/location-prompt.svelte';
	import MatchedPeopleRail from '$lib/components/matched-people-rail.svelte';
	import CategoryRail from '$lib/components/category-rail.svelte';

	let { data } = $props();

	// Waitlist signup, inline on the splash.
	let email = $state('');
	let joinStatus = $state<'idle' | 'working' | 'done' | 'error'>('idle');
	let joinError = $state<string | null>(null);

	// Best-effort browser location. Resolves to null on denial/timeout/no
	// support so it can NEVER block the email capture.
	function getCoords(): Promise<{ latitude: number; longitude: number } | null> {
		if (typeof navigator === 'undefined' || !navigator.geolocation) return Promise.resolve(null);
		return new Promise((resolve) => {
			navigator.geolocation.getCurrentPosition(
				(pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
				() => resolve(null),
				{ enableHighAccuracy: false, timeout: 8000, maximumAge: 5 * 60_000 }
			);
		});
	}

	async function joinWaitlist(event: SubmitEvent) {
		event.preventDefault();
		const value = email.trim();
		if (!value || joinStatus === 'working') return;
		joinStatus = 'working';
		joinError = null;

		// Start the location prompt in parallel, but DON'T let it gate the
		// email: we save the email first so closing the tab during the
		// permission prompt can never lose it.
		const coordsPromise = getCoords();

		try {
			const res = await fetch('/api/waitlist', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ email: value })
			});
			if (!res.ok) throw new Error(await res.text().catch(() => `Status ${res.status}`));
			joinStatus = 'done';
		} catch (err) {
			console.error('Waitlist join failed:', err);
			joinStatus = 'error';
			joinError = 'Something went wrong. Please try again.';
			return;
		}

		// Best-effort location enrichment once the email is safely stored.
		// Fire-and-forget: a failure here doesn't matter, we already have them.
		const coords = await coordsPromise;
		if (coords) {
			fetch('/api/waitlist', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ email: value, ...coords })
			}).catch((err) => console.error('Waitlist location enrich failed:', err));
		}
	}
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
		{#if joinStatus === 'done'}
			<div
				class="text-foreground mx-auto mt-8 flex max-w-md items-center justify-center gap-2 text-sm"
			>
				<Check class="text-primary size-5 shrink-0" />
				<p>You're on the list. We'll email you an invite when your area is ready.</p>
			</div>
		{:else}
			<form
				onsubmit={joinWaitlist}
				class="mx-auto mt-8 flex max-w-md flex-col gap-3 sm:flex-row"
			>
				<Input
					name="email"
					type="email"
					placeholder="you@example.com"
					bind:value={email}
					required
					class="h-11 flex-1"
				/>
				<Button type="submit" size="lg" disabled={joinStatus === 'working'}>
					{#if joinStatus === 'working'}
						<Loader2 class="size-4 animate-spin" />
						Joining…
					{:else}
						Join the waitlist
						<ArrowRight class="size-4" />
					{/if}
				</Button>
			</form>
			{#if joinError}
				<p class="text-destructive mt-3 text-sm">{joinError}</p>
			{/if}
			<p class="text-muted-foreground mt-3 text-sm">
				Already have an invite? <a href="/sign-in" class="underline">Sign in</a>
			</p>
		{/if}
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
