<script lang="ts">
	let { data } = $props();
	const s = $derived(data.stats);
</script>

<svelte:head>
	<title>Admin · Overview — Curiomancer</title>
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

	<!-- Relations -->
	<section class="bg-card rounded-xl border p-5">
		<h2 class="text-muted-foreground text-xs font-medium uppercase tracking-wide">Relations</h2>
		<p class="mt-2 text-3xl font-semibold tabular-nums">
			{s.liked + s.disliked + s.seen + s.want_to_go}
		</p>
		<p class="text-muted-foreground mt-1 text-xs">
			{s.liked} 👍 · {s.disliked} 👎 · {s.seen} 👁 · {s.want_to_go} want
		</p>
	</section>

	<!-- Invites -->
	<section class="bg-card rounded-xl border p-5">
		<h2 class="text-muted-foreground text-xs font-medium uppercase tracking-wide">Invites</h2>
		<p class="mt-2 text-3xl font-semibold tabular-nums">{s.invites_redeemed} / {s.invites_total}</p>
		<p class="text-muted-foreground mt-1 text-xs">redeemed</p>
	</section>
</div>
