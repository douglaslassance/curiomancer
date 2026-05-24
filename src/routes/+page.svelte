<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { ArrowRight, Sparkles, Users } from '@lucide/svelte';
</script>

<section class="py-16 text-center">
	<h1 class="text-balance text-4xl font-semibold tracking-tight md:text-5xl">
		Find your people. Find their places.
	</h1>
	<p class="text-muted-foreground mx-auto mt-4 max-w-xl text-balance text-lg">
		Bond cross-references taste so you can discover shops, bars, and restaurants picked by
		people who actually share yours — wherever you happen to be.
	</p>
	<div class="mt-8 flex justify-center gap-3">
		<Button href="/places" size="lg">
			Start discovering
			<ArrowRight class="size-4" />
		</Button>
		<Button href="/sign-up" variant="outline" size="lg">Create account</Button>
	</div>
</section>

<section class="grid gap-6 py-12 md:grid-cols-2">
	<div class="bg-card rounded-xl border p-6">
		<Sparkles class="text-primary size-6" />
		<h2 class="mt-3 text-lg font-medium">Recommendations that travel</h2>
		<p class="text-muted-foreground mt-2 text-sm">
			Love a few spots in LA? Land in Tokyo and Bond surfaces the places loved by the people
			who agree with you in both cities.
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
