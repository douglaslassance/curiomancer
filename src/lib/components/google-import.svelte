<script lang="ts">
	import { goto } from '$app/navigation';
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Loader2, Upload, CheckCircle2, FileText, X, ExternalLink } from '@lucide/svelte';
	import {
		parseListFile,
		kindFromFilename,
		computeHomeRegions,
		pickBestCandidate,
		type ImportRow,
		type ImportKind,
		type ResolvedRow
	} from '$lib/google-import';

	const KIND_LABEL: Record<ImportKind, string> = {
		liked: 'Likes',
		want_to_go: 'Want to go'
	};

	const BATCH_SIZE = 40;

	// select: pick/queue files. running/done: importing + summary.
	type Phase = 'select' | 'running' | 'done';
	let phase = $state<Phase>('select');
	// Two work stages within `running`: resolve titles, then save the picks.
	let stage = $state<'resolving' | 'saving'>('resolving');
	let error = $state<string | null>(null);

	// Files queued for import, accumulated across picks. Each carries its own
	// parsed rows so a file can be removed and the totals recomputed.
	type QueuedFile = { name: string; kind: ImportKind; rows: ImportRow[] };
	let queued = $state<QueuedFile[]>([]);

	let resolvedCount = $state(0);
	let commitTotal = $state(0);
	let processed = $state(0);
	let imported = $state(0);
	let unmatched = $state<string[]>([]);
	let errored = $state<string[]>([]);

	// Combined, de-duped rows across every queued file. A place in both lists
	// counts as a like (like outranks want-to-go).
	const rows = $derived.by(() => {
		const byTitle = new Map<string, ImportRow>();
		for (const f of queued) {
			for (const r of f.rows) {
				const key = r.title.toLowerCase();
				const existing = byTitle.get(key);
				if (!existing || (existing.kind === 'want_to_go' && r.kind === 'liked')) {
					byTitle.set(key, r);
				}
			}
		}
		return [...byTitle.values()];
	});

	const likedCount = $derived(rows.filter((r) => r.kind === 'liked').length);
	const wantCount = $derived(rows.filter((r) => r.kind === 'want_to_go').length);
	const pct = $derived.by(() => {
		if (stage === 'resolving') return rows.length ? Math.round((resolvedCount / rows.length) * 100) : 0;
		return commitTotal ? Math.round((processed / commitTotal) * 100) : 100;
	});

	async function onPick(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const picked = Array.from(input.files ?? []);
		input.value = ''; // allow re-picking the same file
		error = null;

		const next = [...queued];
		const skipped: string[] = [];
		for (const file of picked) {
			const kind = kindFromFilename(file.name);
			if (!kind) {
				skipped.push(file.name);
				continue;
			}
			const entry: QueuedFile = { name: file.name, kind, rows: parseListFile(await file.text(), kind) };
			// Re-picking the same filename replaces its earlier entry.
			const idx = next.findIndex((f) => f.name === file.name);
			if (idx >= 0) next[idx] = entry;
			else next.push(entry);
		}
		queued = next;

		if (skipped.length) {
			error = queued.length
				? `Skipped ${skipped.join(', ')} - only "Favorite places.csv" and "Want to go.csv" are supported.`
				: `Couldn't recognise ${skipped.join(', ')}. Add "Favorite places.csv" or "Want to go.csv".`;
		}
	}

	function removeFile(name: string) {
		queued = queued.filter((f) => f.name !== name);
		error = null;
	}

	async function runImport() {
		phase = 'running';
		stage = 'resolving';
		resolvedCount = 0;
		commitTotal = 0;
		processed = 0;
		imported = 0;
		unmatched = [];
		errored = [];

		// Phase 1: resolve every title to its top Apple candidates (no writes).
		const resolved: ResolvedRow[] = [];
		for (let i = 0; i < rows.length; i += BATCH_SIZE) {
			const batch = rows.slice(i, i + BATCH_SIZE);
			try {
				const res = await fetch('/api/import/google', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						phase: 'resolve',
						rows: batch.map((r) => ({
							title: r.title,
							kind: r.kind,
							latitude: r.latitude,
							longitude: r.longitude
						}))
					})
				});
				if (!res.ok) throw new Error(await res.text());
				const data = (await res.json()) as { results: ResolvedRow[] };
				resolved.push(...data.results);
			} catch (err) {
				console.error('Resolve batch failed:', err);
				// Keep the rows so they surface as unmatched rather than vanishing.
				for (const r of batch) {
					resolved.push({
						title: r.title,
						kind: r.kind,
						latitude: r.latitude,
						longitude: r.longitude,
						candidates: []
					});
				}
			}
			resolvedCount = Math.min(i + batch.length, rows.length);
		}

		// Infer the user's home regions from where their places land, then pick
		// the candidate per row that fits that footprint (see google-import.ts).
		const anchors = resolved.flatMap((r) =>
			typeof r.latitude === 'number' && typeof r.longitude === 'number'
				? [{ latitude: r.latitude, longitude: r.longitude }]
				: r.candidates[0]
					? [{ latitude: r.candidates[0].latitude, longitude: r.candidates[0].longitude }]
					: []
		);
		const regions = computeHomeRegions(anchors);

		const decided = resolved.map((r) => ({
			title: r.title,
			kind: r.kind,
			cand: pickBestCandidate(r, regions)
		}));
		for (const d of decided) if (!d.cand) unmatched.push(d.title);
		const toCommit = decided.filter(
			(d): d is typeof d & { cand: NonNullable<typeof d.cand> } => !!d.cand
		);
		commitTotal = toCommit.length;

		// Phase 2: write place rows + relations for the chosen candidates.
		stage = 'saving';
		for (let i = 0; i < toCommit.length; i += BATCH_SIZE) {
			const batch = toCommit.slice(i, i + BATCH_SIZE);
			try {
				const res = await fetch('/api/import/google', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						phase: 'commit',
						rows: batch.map((d) => ({ ...d.cand, kind: d.kind }))
					})
				});
				if (!res.ok) throw new Error(await res.text());
				const data = (await res.json()) as { results: { status: 'imported' | 'error' }[] };
				data.results.forEach((r, idx) => {
					if (r.status === 'imported') imported++;
					else errored.push(batch[idx].title);
				});
			} catch (err) {
				console.error('Commit batch failed:', err);
				for (const d of batch) errored.push(d.title);
			}
			processed = Math.min(i + batch.length, toCommit.length);
		}
		phase = 'done';
	}

	function reset() {
		phase = 'select';
		queued = [];
		error = null;
	}

	function mapsUrl(title: string): string {
		return `https://www.google.com/maps/search/${encodeURIComponent(title)}`;
	}
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>Import from Google Maps</Card.Title>
		<Card.Description>Bring your saved places to Curiomancer.</Card.Description>
	</Card.Header>
	<Card.Content class="space-y-4">
		{#if phase === 'select'}
			<!-- Step 1: export from Takeout -->
			<div class="flex gap-3">
				<span
					class="bg-muted flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-medium"
				>
					1
				</span>
				<div class="min-w-0 flex-1">
					<div class="text-sm font-medium">Export from Google Takeout</div>
					<p class="text-muted-foreground mt-1 text-sm">
						Deselect all, tick only <span class="text-foreground font-medium">Saved</span>, then
						export and unzip. Your lists are in the
						<span class="text-foreground font-medium">Saved</span> folder.
					</p>
					<Button
						href="https://takeout.google.com/"
						target="_blank"
						rel="noopener"
						variant="outline"
						size="sm"
						class="mt-2"
					>
						<ExternalLink class="size-3.5" />
						Open Google Takeout
					</Button>
				</div>
			</div>

			<!-- Step 2: upload the files -->
			<div class="flex gap-3">
				<span
					class="bg-muted flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-medium"
				>
					2
				</span>
				<div class="min-w-0 flex-1">
					<div class="text-sm font-medium">Upload your files</div>
					<p class="text-muted-foreground mt-1 text-sm">
						Drop <span class="text-foreground font-medium">Favorite places.csv</span> and
						<span class="text-foreground font-medium">Want to go.csv</span>.
					</p>
					<label
						class="border-muted-foreground/25 hover:border-muted-foreground/50 mt-2 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-8 text-center transition-colors"
					>
						<Upload class="text-muted-foreground size-6" />
						<span class="text-sm font-medium">Choose CSV files</span>
						<span class="text-muted-foreground text-xs">Favorite places.csv, Want to go.csv</span>
						<input type="file" accept=".csv,text/csv" multiple class="hidden" onchange={onPick} />
					</label>
				</div>
			</div>

			{#if error}
				<p class="text-destructive text-sm">{error}</p>
			{/if}

			{#if queued.length > 0}
				<div class="space-y-2">
					{#each queued as f (f.name)}
						<div class="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
							<FileText class="text-muted-foreground size-4 shrink-0" />
							<span class="min-w-0 flex-1 truncate">{f.name}</span>
							<span class="text-muted-foreground shrink-0 text-xs">
								{f.rows.length} → {KIND_LABEL[f.kind]}
							</span>
							<button
								type="button"
								onclick={() => removeFile(f.name)}
								class="text-muted-foreground hover:text-destructive shrink-0"
								aria-label={`Remove ${f.name}`}
							>
								<X class="size-4" />
							</button>
						</div>
					{/each}
				</div>
				<Button onclick={runImport} disabled={rows.length === 0} class="w-full">
					Import {rows.length} place{rows.length === 1 ? '' : 's'}
					({likedCount} likes, {wantCount} want-to-go)
				</Button>
			{/if}
		{/if}

		{#if phase === 'running'}
			<div class="space-y-3">
				<div class="flex items-center gap-2 text-sm">
					<Loader2 class="text-muted-foreground size-4 animate-spin" />
					{#if stage === 'resolving'}
						Matching places against Apple Maps… {resolvedCount} of {rows.length}
					{:else}
						Placing them by region and saving… {processed} of {commitTotal}
					{/if}
				</div>
				<div class="bg-muted h-2 w-full overflow-hidden rounded-full">
					<div class="bg-primary h-full transition-all" style="width: {pct}%"></div>
				</div>
				<p class="text-muted-foreground text-xs">
					This can take a few minutes for a large list. Keep this tab open.
				</p>
			</div>
		{/if}

		{#if phase === 'done'}
			<div class="space-y-4">
				<div class="flex items-center gap-2 text-sm font-medium">
					<CheckCircle2 class="size-5 text-emerald-500" />
					Imported {imported} of {rows.length} place{rows.length === 1 ? '' : 's'}.
				</div>

				{#if unmatched.length > 0}
					<div>
						<p class="text-sm font-medium">
							{unmatched.length} couldn't be matched on Apple Maps
						</p>
						<p class="text-muted-foreground mt-0.5 text-xs">
							No matching place was found near where it was saved. You can add these by hand from
							the map.
						</p>
						<ul class="mt-2 max-h-48 space-y-1 overflow-y-auto text-sm">
							{#each unmatched as title (title)}
								<li class="flex items-center gap-1.5">
									<span class="min-w-0 truncate">{title}</span>
									<a
										href={mapsUrl(title)}
										target="_blank"
										rel="noopener"
										class="text-muted-foreground hover:text-foreground shrink-0"
										aria-label="Open in Google Maps"
									>
										<ExternalLink class="size-3.5" />
									</a>
								</li>
							{/each}
						</ul>
					</div>
				{/if}

				{#if errored.length > 0}
					<div>
						<p class="text-sm font-medium">{errored.length} hit an error</p>
						<p class="text-muted-foreground mt-0.5 text-xs">
							Likely a rate limit or hiccup. Re-running the import is safe and only retries what's
							missing.
						</p>
					</div>
				{/if}

				<div class="flex gap-2">
					<Button onclick={() => goto('/')}>Go to dashboard</Button>
					{#if errored.length > 0 || unmatched.length > 0}
						<Button onclick={reset} variant="ghost">Import more files</Button>
					{/if}
				</div>
			</div>
		{/if}
	</Card.Content>
</Card.Root>
