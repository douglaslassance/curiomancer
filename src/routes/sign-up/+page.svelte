<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Card from '$lib/components/ui/card';
	import SubmitButton from '$lib/components/submit-button.svelte';
	import { pendingForm } from '$lib/pending-form.svelte';
	import { LocateFixed, Loader2, MailCheck, Sparkles } from '@lucide/svelte';

	let { data, form } = $props();
	const createAccount = pendingForm();

	// City field: same Apple-Maps autocomplete + "Detect" as the splash waitlist.
	// The chosen coordinates ride along in hidden inputs so the server can store
	// the user's location without a second lookup when they used Detect.
	let city = $state('');
	let latitude = $state('');
	let longitude = $state('');
	let detecting = $state(false);

	type Completion = { title: string; subtitle: string };
	let citySuggestions = $state<Completion[]>([]);
	let showSuggestions = $state(false);
	let acTimer: ReturnType<typeof setTimeout> | null = null;

	function onCityInput() {
		// Typing invalidates any coordinates a prior "Detect" filled in.
		latitude = '';
		longitude = '';
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
				const body = (await res.json()) as { results: Completion[] };
				citySuggestions = body.results;
				showSuggestions = body.results.length > 0;
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
				const body = (await res.json()) as { city?: string };
				if (body.city) {
					city = body.city;
					latitude = String(coords.latitude);
					longitude = String(coords.longitude);
				}
			}
		} catch (err) {
			console.error('Detect location failed:', err);
		} finally {
			detecting = false;
		}
	}
</script>

<div class="mx-auto w-full max-w-md py-10">
	<Card.Root>
		{#if form?.verifyEmailSent}
			<Card.Header>
				<Card.Title class="flex items-center gap-1.5">
					<MailCheck class="text-primary size-5" />
					Check your email
				</Card.Title>
				<Card.Description>
					We sent a verification link to {form.email}. Click it to finish setting up your account.
				</Card.Description>
			</Card.Header>
		{:else}
			<Card.Header>
				<Card.Title>Create your account</Card.Title>
				<Card.Description>
					{#if data.inviteState === 'valid' && data.inviter}
						<span class="flex items-center gap-1.5">
							<Sparkles class="text-primary size-4" />
							{data.inviter.name} is inviting you to Curiomancer.
						</span>
					{:else if data.inviteState === 'valid'}
						<span class="flex items-center gap-1.5">
							<Sparkles class="text-primary size-4" />
							You've been invited to Curiomancer.
						</span>
					{:else if data.inviteState === 'invalid'}
						That invite code is invalid or already used.
					{:else}
						Curiomancer is invite-only. Paste your code below.
					{/if}
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<form method="post" class="space-y-4" use:enhance={createAccount.enhance}>
					{#if data.inviteState === 'valid'}
						<input type="hidden" name="invite" value={data.code ?? ''} />
					{:else}
						<div class="space-y-2">
							<Label for="invite-input">Invite code</Label>
							<Input
								id="invite-input"
								name="invite"
								type="text"
								placeholder="ABCD-EFGH-IJKL"
								value={data.code ?? ''}
								autocomplete="off"
								class="font-mono uppercase"
							/>
							<p class="text-muted-foreground text-xs">
								No code? <a href="/" class="underline">Join the waitlist</a>
							</p>
						</div>
					{/if}
					<div class="space-y-2">
						<Label for="name">Name</Label>
						<Input
							id="name"
							name="name"
							type="text"
							placeholder="Jane Doe"
							value={form?.name ?? ''}
							required
						/>
					</div>
					<div class="space-y-2">
						<Label for="email">Email</Label>
						<Input
							id="email"
							name="email"
							type="email"
							placeholder="you@example.com"
							value={data.invitedEmail ?? form?.email ?? ''}
							readonly={!!data.invitedEmail}
							required
						/>
						{#if data.invitedEmail}
							<p class="text-muted-foreground text-sm">Your invite is tied to this address.</p>
						{/if}
					</div>
					<div class="space-y-2">
						<Label for="city">City</Label>
						<div class="flex gap-2">
							<div class="relative flex-1">
								<Input
									id="city"
									name="city"
									type="text"
									placeholder="Your city"
									bind:value={city}
									required
									autocomplete="off"
									oninput={onCityInput}
									onblur={() => setTimeout(() => (showSuggestions = false), 150)}
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
													{#if s.subtitle}<span class="text-muted-foreground"> · {s.subtitle}</span
														>{/if}
												</button>
											</li>
										{/each}
									</ul>
								{/if}
							</div>
							<Button type="button" variant="outline" onclick={detectLocation} disabled={detecting}>
								{#if detecting}
									<Loader2 class="size-4 animate-spin" />
								{:else}
									<LocateFixed class="size-4" />
								{/if}
								Detect
							</Button>
						</div>
						<input type="hidden" name="latitude" value={latitude} />
						<input type="hidden" name="longitude" value={longitude} />
						<p class="text-muted-foreground text-xs">Sets your home base for recommendations.</p>
					</div>
					<div class="space-y-2">
						<Label for="password">Password</Label>
						<Input id="password" name="password" type="password" required minlength={8} />
					</div>
					{#if form?.message}
						<p class="text-destructive text-sm">{form.message}</p>
					{/if}
					<SubmitButton pending={createAccount.submitting} pendingLabel="Creating account…" class="w-full">
						Create account
					</SubmitButton>
				</form>
			</Card.Content>
		{/if}
		<Card.Footer class="justify-center text-sm">
			<span class="text-muted-foreground">Already on Curiomancer?</span>
			<a href="/sign-in" class="ml-1 underline">Sign in</a>
		</Card.Footer>
	</Card.Root>
</div>
