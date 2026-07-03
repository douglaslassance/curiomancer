<script lang="ts">
	import { Bookmark, Eye, ThumbsDown, ThumbsUp } from '@lucide/svelte';

	let { data } = $props();
	const s = $derived(data.stats);
</script>

<svelte:head>
	<title>Admin · Overview · Curiomancer</title>
</svelte:head>

<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
	<!-- Users -->
	<section class="bg-card rounded-xl border p-5">
		<h2 class="text-muted-foreground text-xs font-medium uppercase tracking-wide">Users</h2>
		<p class="mt-2 text-3xl font-semibold tabular-nums">{s.users}</p>
		<p class="text-muted-foreground mt-1 text-xs">{s.admins} admin{s.admins === 1 ? '' : 's'}</p>
	</section>

	<!-- Places -->
	<section class="bg-card rounded-xl border p-5">
		<h2 class="text-muted-foreground text-xs font-medium uppercase tracking-wide">Places</h2>
		<p class="mt-2 text-3xl font-semibold tabular-nums">{s.places}</p>
		<p class="text-muted-foreground mt-1 text-xs">
			{s.places_apple} apple · {s.places_manual} manual · {s.places_seed} seed
		</p>
	</section>

	<!-- Ratings -->
	<section class="bg-card rounded-xl border p-5">
		<h2 class="text-muted-foreground text-xs font-medium uppercase tracking-wide">Ratings</h2>
		<p class="mt-2 text-3xl font-semibold tabular-nums">
			{s.liked + s.disliked + s.seen + s.want_to_go}
		</p>
		<div class="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
			<span class="inline-flex items-center gap-1"><ThumbsUp class="size-3" />{s.liked}</span>
			<span class="inline-flex items-center gap-1"><ThumbsDown class="size-3" />{s.disliked}</span>
			<span class="inline-flex items-center gap-1"><Eye class="size-3" />{s.seen}</span>
			<span class="inline-flex items-center gap-1"><Bookmark class="size-3" />{s.want_to_go}</span>
		</div>
	</section>

	<!-- Invites -->
	<section class="bg-card rounded-xl border p-5">
		<h2 class="text-muted-foreground text-xs font-medium uppercase tracking-wide">Invites</h2>
		<p class="mt-2 text-3xl font-semibold tabular-nums">{s.invites_redeemed} / {s.invites_total}</p>
		<p class="text-muted-foreground mt-1 text-xs">redeemed</p>
	</section>
</div>
