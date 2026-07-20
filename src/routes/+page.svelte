<script lang="ts">
	import { browser } from '$app/environment';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import * as Card from '$lib/components/ui/card';
	import { PLAN_NAME } from '$lib/subscription';
	import {
		ArrowRight,
		Check,
		Download,
		LocateFixed,
		Loader2,
		Luggage,
		MessageCircle,
		ShieldCheck,
		SlidersHorizontal
	} from '@lucide/svelte';
	import DashboardHeader from '$lib/components/dashboard-header.svelte';
	import LocationPrompt from '$lib/components/location-prompt.svelte';
	import MatchedPeopleRail from '$lib/components/matched-people-rail.svelte';
	import CategoryRail from '$lib/components/category-rail.svelte';

	let { data } = $props();

	// Onboarding: a brand-new user (no likes yet) is offered the Google import.
	// "Skip for now" is remembered so it doesn't nag on every visit; the card
	// also stops showing on its own once they have any likes.
	const IMPORT_SKIP_KEY = 'import-onboarding-dismissed';
	let importSkipped = $state(browser && localStorage.getItem(IMPORT_SKIP_KEY) === '1');
	function skipImport() {
		importSkipped = true;
		if (browser) localStorage.setItem(IMPORT_SKIP_KEY, '1');
	}

	// Waitlist signup, inline on the splash.
	let email = $state('');
	let city = $state('');
	let joinStatus = $state<'idle' | 'working' | 'done' | 'error'>('idle');
	let joinError = $state<string | null>(null);
	let detecting = $state(false);

	// City autocomplete (Apple Maps, proxied server-side).
	type Completion = { title: string; subtitle: string };
	let citySuggestions = $state<Completion[]>([]);
	let showSuggestions = $state(false);
	let acTimer: ReturnType<typeof setTimeout> | null = null;

	// Both email and city are required; the submit button stays disabled
	// until they're filled.
	const canSubmit = $derived(
		email.trim().length > 0 && city.trim().length > 0 && joinStatus !== 'working'
	);

	function onCityInput() {
		const q = city.trim();
		if (acTimer) clearTimeout(acTimer);
		if (q.length < 2) {
			citySuggestions = [];
			showSuggestions = false;
			return;
		}
		acTimer = setTimeout(async () => {
			try {
				const res = await fetch(`/api/place-autocomplete?q=${encodeURIComponent(q)}`);
				if (!res.ok) return;
				const data = (await res.json()) as { results: Completion[] };
				citySuggestions = data.results;
				showSuggestions = data.results.length > 0;
			} catch (err) {
				console.error('City autocomplete failed:', err);
			}
		}, 250);
	}

	function pickSuggestion(s: Completion) {
		city = s.subtitle ? `${s.title}, ${s.subtitle}` : s.title;
		citySuggestions = [];
		showSuggestions = false;
	}

	// "Detect" button: ask the browser for location, reverse-geocode it,
	// and drop the city name into the field. Opt-in, so there's no surprise
	// permission prompt; on denial/failure we just leave the field for
	// manual entry.
	async function detectLocation() {
		if (typeof navigator === 'undefined' || !navigator.geolocation) return;
		detecting = true;
		try {
			const coords = await new Promise<{ latitude: number; longitude: number } | null>(
				(resolve) => {
					navigator.geolocation.getCurrentPosition(
						(pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
						() => resolve(null),
						{ enableHighAccuracy: false, timeout: 8000, maximumAge: 5 * 60_000 }
					);
				}
			);
			if (!coords) return;
			const res = await fetch('/api/geocode', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(coords)
			});
			if (res.ok) {
				const data = (await res.json()) as { city?: string };
				if (data.city) city = data.city;
			}
		} catch (err) {
			console.error('Detect location failed:', err);
		} finally {
			detecting = false;
		}
	}

	async function joinWaitlist(event: SubmitEvent) {
		event.preventDefault();
		const value = email.trim();
		const cityValue = city.trim();
		if (!value || !cityValue || joinStatus === 'working') return;
		joinStatus = 'working';
		joinError = null;

		// Email and city go up together in one atomic call - nothing async
		// stands between the click and the save, so we can't lose the email.
		try {
			const res = await fetch('/api/waitlist', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ email: value, city: cityValue })
			});
			if (!res.ok) throw new Error(await res.text().catch(() => `Status ${res.status}`));
			joinStatus = 'done';
		} catch (err) {
			console.error('Waitlist join failed:', err);
			joinStatus = 'error';
			joinError = 'Something went wrong. Please try again.';
		}
	}
</script>

{#if !data.signedIn}
	<!-- --- Anonymous splash ----------------------------------------------- -->
	<div class="flex flex-1 flex-col justify-center gap-10">
		<section class="text-center">
			<h1 class="text-balance text-4xl font-semibold tracking-tight md:text-5xl">
				Let your taste guide you
			</h1>
			<p class="text-muted-foreground mx-auto mt-4 max-w-xl text-balance text-lg">
				Curiomancer cross-references your taste to surface the places and people worth your time,
				wherever you are or wherever you go.
			</p>
		</section>

		<section class="grid gap-4 md:grid-cols-3">
			<Card.Root>
				<Card.Content>
					<div class="flex items-center gap-2">
						<Luggage class="text-primary size-5" />
						<h2 class="text-base font-medium">Recommendations that travel</h2>
					</div>
					<p class="text-muted-foreground mt-2 text-sm">
						Whether you land in Tokyo or a backroad town, Curiomancer surfaces the places your
						taste-twins love, right where the big apps leave you guessing.
					</p>
				</Card.Content>
			</Card.Root>
			<Card.Root>
				<Card.Content>
					<div class="flex items-center gap-2">
						<ShieldCheck class="text-primary size-5" />
						<h2 class="text-base font-medium">No data trap</h2>
					</div>
					<p class="text-muted-foreground mt-2 text-sm">
						Your taste belongs to you, available through our open API to connect with the other
						services you use.
					</p>
				</Card.Content>
			</Card.Root>
			<div class="relative">
				<Card.Root class="h-full">
					<Card.Content>
						<div class="flex items-center gap-2">
							<MessageCircle class="text-primary size-5" />
							<h2 class="text-base font-medium">Expand your network</h2>
						</div>
						<p class="text-muted-foreground mt-2 text-sm">
							Reach the people who share your taste. Message your taste-twins and trade the spots
							that never make a list.
						</p>
					</Card.Content>
				</Card.Root>
				<span
					class="bg-primary text-primary-foreground absolute -top-2 -right-2 rounded-full px-2 py-0.5 text-xs font-medium"
				>
					{PLAN_NAME}
				</span>
			</div>
		</section>

		<section class="text-center">
			{#if joinStatus === 'done'}
				<div
					class="text-foreground mx-auto flex max-w-md items-center justify-center gap-2 text-sm"
				>
					<Check class="text-primary size-5 shrink-0" />
					<p>You're on the list. We'll email you an invite when your area is ready.</p>
				</div>
			{:else}
				<form onsubmit={joinWaitlist} class="mx-auto max-w-md space-y-3">
					<Input
						name="email"
						type="email"
						placeholder="you@example.com"
						bind:value={email}
						required
						class="h-11"
					/>
					<div class="flex gap-2">
						<div class="relative flex-1">
							<Input
								name="city"
								type="text"
								placeholder="Your city"
								bind:value={city}
								required
								autocomplete="off"
								oninput={onCityInput}
								onblur={() => setTimeout(() => (showSuggestions = false), 150)}
								class="h-11 w-full"
							/>
							{#if showSuggestions}
								<ul
									class="bg-popover absolute inset-x-0 z-20 mt-1 overflow-hidden rounded-md border text-left shadow-md"
								>
									{#each citySuggestions as s (s.title + s.subtitle)}
										<li>
											<button
												type="button"
												class="hover:bg-accent block w-full px-3 py-2 text-left text-sm"
												onclick={() => pickSuggestion(s)}
											>
												<span class="font-medium">{s.title}</span>
												{#if s.subtitle}<span class="text-muted-foreground">
														· {s.subtitle}</span
													>{/if}
											</button>
										</li>
									{/each}
								</ul>
							{/if}
						</div>
						<Button
							type="button"
							variant="outline"
							class="h-11"
							onclick={detectLocation}
							disabled={detecting}
						>
							{#if detecting}
								<Loader2 class="size-4 animate-spin" />
							{:else}
								<LocateFixed class="size-4" />
							{/if}
							Detect
						</Button>
					</div>
					<Button type="submit" size="lg" class="h-11 w-full" disabled={!canSubmit}>
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
	</div>
{:else if !data.location}
	<!-- --- Signed-in but no location yet ----------------------------------- -->
	<div class="py-12">
		<LocationPrompt />
	</div>
{:else}
	<!-- --- Dashboard ------------------------------------------------------- -->
	<DashboardHeader location={data.location} weather={data.weather} />

	{@const hasAnyRecs =
		data.eat.length > 0 ||
		data.drink.length > 0 ||
		data.shop.length > 0 ||
		data.visit.length > 0}
	<!-- Until the user has real taste-twins, the rails are the most-liked places
	     nearby (popular_fallback), so we label them "Popular" and keep nudging
	     them to Tune. Once twin matches exist the rails become "Recommended" and
	     the nudge stands down. -->
	{@const railPrefix = data.hasTwinRecs ? 'Recommended' : 'Popular'}

	{#if data.myLikeCount === 0 && !importSkipped && !data.isMobile}
		<Card.Root class="border-primary/30 bg-primary/5 mb-6">
			<Card.Content class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<div class="flex items-start gap-3">
					<Download class="text-primary mt-0.5 size-5 shrink-0" />
					<div>
						<h2 class="text-base font-medium">Bring your taste with you</h2>
						<p class="text-muted-foreground mt-1 text-sm">
							Import your saved places from Google Maps to get matches right away. Favorites become
							likes, "Want to go" carries across.
						</p>
					</div>
				</div>
				<div class="flex shrink-0 items-center gap-2 self-end sm:self-auto">
					<Button variant="ghost" size="sm" onclick={skipImport}>Skip for now</Button>
					<Button href="/import/google" size="sm">
						Import
						<ArrowRight class="size-4" />
					</Button>
				</div>
			</Card.Content>
		</Card.Root>
	{:else if !data.hasTwinRecs && hasAnyRecs}
		<!-- No twins yet: the rails below are popular picks, not personalised.
		     Set that expectation and point them at Tune. Same bar as before for
		     when this stands down: any twin-driven recommendation. -->
		<Card.Root class="border-primary/30 bg-primary/5 mb-6">
			<Card.Content class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<div class="flex items-start gap-3">
					<SlidersHorizontal class="text-primary mt-0.5 size-5 shrink-0" />
					<div>
						<h2 class="text-base font-medium">Tune your taste for personal picks</h2>
						<p class="text-muted-foreground mt-1 text-sm">
							{data.myLikeCount === 0
								? "Below are popular spots near you. Rate a few places you know and we'll find the people who share your taste, then recommend what they love."
								: "Below are popular spots near you. Rate more places to sharpen your matches and unlock personal recommendations."}
						</p>
					</div>
				</div>
				<Button href="/tune" size="sm" class="shrink-0 self-end sm:self-auto">
					Start tuning
					<ArrowRight class="size-4" />
				</Button>
			</Card.Content>
		</Card.Root>
	{/if}

	{#if hasAnyRecs}
		<CategoryRail
			title={`${railPrefix} Eat`}
			places={data.eat}
			empty={`Nowhere to eat in ${data.location.city} yet.`}
		/>

		<CategoryRail
			title={`${railPrefix} Drink`}
			places={data.drink}
			empty={`Nowhere to drink in ${data.location.city} yet.`}
		/>

		<CategoryRail
			title={`${railPrefix} Shop`}
			places={data.shop}
			empty={`Nowhere to shop in ${data.location.city} yet.`}
		/>

		<CategoryRail
			title={`${railPrefix} Experience`}
			places={data.visit}
			empty={`Nowhere to visit in ${data.location.city} yet.`}
		/>
	{:else}
		<!-- Nothing at all nearby yet, not even popular places (a brand-new area
		     with no likes in our DB). A single hero nudge to Tune beats a page of
		     empty rails. -->
		<Card.Root class="border-primary/30 bg-primary/5">
			<Card.Content class="flex flex-col items-center gap-4 py-12 text-center">
				<div class="bg-primary/10 flex size-14 items-center justify-center rounded-full">
					<SlidersHorizontal class="text-primary size-7" />
				</div>
				<div class="max-w-md">
					<h2 class="text-xl font-semibold tracking-tight">
						Tune your taste to unlock recommendations
					</h2>
					<p class="text-muted-foreground mt-2 text-sm">
						Rate a few places you know and we'll find the people who share your taste, then
						recommend the spots they love.
					</p>
				</div>
				<Button href="/tune" size="lg">
					Start tuning
					<ArrowRight class="size-4" />
				</Button>
			</Card.Content>
		</Card.Root>
	{/if}

	<!-- Only show Twins once there are matches; an empty rail is just noise next
	     to the Tune nudge (see the cold-start branch above). -->
	{#if data.matchedPeople.length > 0}
		<MatchedPeopleRail people={data.matchedPeople} />
	{/if}
{/if}
