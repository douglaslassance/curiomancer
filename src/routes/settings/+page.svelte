<script lang="ts">
	import { enhance } from '$app/forms';
	import * as Avatar from '$lib/components/ui/avatar';
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Separator } from '$lib/components/ui/separator';
	import { Heart, LogOut, MapPin, Mail, User } from '@lucide/svelte';

	let { data } = $props();

	const initials = $derived(
		data.profile.name
			.split(/\s+/)
			.filter(Boolean)
			.slice(0, 2)
			.map((s: string) => s[0]?.toUpperCase() ?? '')
			.join('') || '?'
	);
</script>

<svelte:head>
	<title>Settings — Bond</title>
</svelte:head>

<div class="mx-auto max-w-xl py-4">
	<header class="mb-6">
		<h1 class="text-2xl font-semibold tracking-tight">Settings</h1>
		<p class="text-muted-foreground mt-1 text-sm">
			Your account and preferences. More controls land here as the product grows.
		</p>
	</header>

	<Card.Root>
		<Card.Header>
			<div class="flex items-center gap-4">
				<Avatar.Root class="size-14">
					{#if data.profile.image}
						<Avatar.Image src={data.profile.image} alt={data.profile.name} />
					{/if}
					<Avatar.Fallback class="text-base font-medium">{initials}</Avatar.Fallback>
				</Avatar.Root>
				<div class="min-w-0">
					<Card.Title>{data.profile.name}</Card.Title>
					<Card.Description class="mt-0.5 flex items-center gap-1.5 text-xs">
						<Mail class="size-3" />
						{data.profile.email}
					</Card.Description>
				</div>
			</div>
		</Card.Header>
		<Card.Content class="space-y-4">
			<Separator />

			<div class="flex items-start gap-3">
				<MapPin class="text-muted-foreground mt-0.5 size-4" />
				<div class="min-w-0 flex-1">
					<div class="text-sm font-medium">Current location</div>
					{#if data.location}
						<p class="text-muted-foreground text-sm">
							{data.location.city}{data.location.countryCode
								? `, ${data.location.countryCode}`
								: ''}
							{#if data.location.timezone}
								<span class="text-muted-foreground">· {data.location.timezone}</span>
							{/if}
						</p>
					{:else}
						<p class="text-muted-foreground text-sm">
							Not set. The dashboard prompts on first visit.
						</p>
					{/if}
				</div>
			</div>

			<div class="flex items-start gap-3">
				<Heart class="text-muted-foreground mt-0.5 size-4" />
				<div class="min-w-0 flex-1">
					<div class="text-sm font-medium">Likes</div>
					<p class="text-muted-foreground text-sm">
						You've liked {data.likeCount} place{data.likeCount === 1 ? '' : 's'}.
						<a href="/likes" class="underline">View</a>
					</p>
				</div>
			</div>

			<div class="flex items-start gap-3">
				<User class="text-muted-foreground mt-0.5 size-4" />
				<div class="min-w-0 flex-1">
					<div class="text-sm font-medium">Coming soon</div>
					<p class="text-muted-foreground text-sm">
						Editing your name, changing your password, connecting Google Maps, and deleting your
						account will live here.
					</p>
				</div>
			</div>
		</Card.Content>
		<Card.Footer>
			<form method="post" action="/sign-out" use:enhance class="contents">
				<Button type="submit" variant="outline">
					<LogOut class="size-4" />
					Sign out
				</Button>
			</form>
		</Card.Footer>
	</Card.Root>
</div>
