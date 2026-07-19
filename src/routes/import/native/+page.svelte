<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { Check, Loader2, Upload } from '@lucide/svelte';

	let fileInput: HTMLInputElement | undefined;
	let fileName = $state<string | null>(null);
	let parsed = $state<{ ratings: unknown[] } | null>(null);
	let parseError = $state<string | null>(null);
	let importing = $state(false);
	let result = $state<{ imported: number; skipped: number; total: number } | null>(null);

	async function onPick(e: Event) {
		result = null;
		parseError = null;
		parsed = null;
		fileName = null;
		const file = (e.target as HTMLInputElement).files?.[0];
		if (!file) return;
		fileName = file.name;
		try {
			const data = JSON.parse(await file.text());
			if (!Array.isArray(data?.ratings)) throw new Error('no ratings array');
			parsed = data;
		} catch {
			parseError =
				'That doesn’t look like a Curiomancer export (a .json file with a "ratings" list).';
		}
	}

	async function runImport() {
		if (!parsed) return;
		importing = true;
		parseError = null;
		try {
			const res = await fetch('/api/import/native', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ ratings: parsed.ratings })
			});
			if (!res.ok) throw new Error(await res.text());
			result = await res.json();
			await invalidateAll();
		} catch (err) {
			console.error('Import failed:', err);
			parseError = 'Import failed. Please try again.';
		} finally {
			importing = false;
		}
	}
</script>

<svelte:head>
	<title>Import · Curiomancer</title>
</svelte:head>

<div class="mx-auto max-w-xl py-8">
	<h1 class="text-2xl font-semibold tracking-tight">Import ratings</h1>
	<p class="text-muted-foreground mt-1 text-sm">
		Restore ratings from a Curiomancer export, the JSON file you get from Settings &rarr; Export.
	</p>

	<Card.Root class="mt-6">
		<Card.Content class="flex flex-col gap-4">
			<input
				bind:this={fileInput}
				type="file"
				accept="application/json,.json"
				class="hidden"
				onchange={onPick}
			/>
			<Button variant="outline" class="self-start" onclick={() => fileInput?.click()}>
				<Upload class="size-4" />
				Choose export file
			</Button>

			{#if fileName}
				<p class="text-muted-foreground text-sm">{fileName}</p>
			{/if}
			{#if parseError}
				<p class="text-destructive text-sm">{parseError}</p>
			{/if}

			{#if parsed && !result}
				<p class="text-sm">{parsed.ratings.length} ratings ready to import.</p>
				<Button class="self-start" onclick={runImport} disabled={importing}>
					{#if importing}
						<Loader2 class="size-4 animate-spin" />
						Importing…
					{:else}
						Import {parsed.ratings.length} ratings
					{/if}
				</Button>
			{/if}

			{#if result}
				<div class="text-primary flex items-center gap-2 text-sm">
					<Check class="size-4" />
					Imported {result.imported}{result.skipped ? `, skipped ${result.skipped}` : ''}.
				</div>
				<Button href="/places" variant="outline" size="sm" class="self-start">View your map</Button>
			{/if}
		</Card.Content>
	</Card.Root>
</div>
