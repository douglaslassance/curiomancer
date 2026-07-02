<script lang="ts">
	import { Input } from '$lib/components/ui/input';

	// City field with Apple Maps autocomplete (proxied via /api/place-autocomplete).
	// Same UX as the splash signup. `value` is bindable and the inner <input>
	// carries `name` so it submits inside a plain form action.
	let {
		value = $bindable(''),
		id = 'city',
		name = 'city',
		placeholder = 'City'
	}: {
		value?: string;
		id?: string;
		name?: string;
		placeholder?: string;
	} = $props();

	type Completion = { title: string; subtitle: string };
	let suggestions = $state<Completion[]>([]);
	let show = $state(false);
	let timer: ReturnType<typeof setTimeout> | null = null;

	function onInput() {
		const q = value.trim();
		if (timer) clearTimeout(timer);
		if (q.length < 2) {
			suggestions = [];
			show = false;
			return;
		}
		timer = setTimeout(async () => {
			try {
				const res = await fetch(`/api/place-autocomplete?q=${encodeURIComponent(q)}`);
				if (!res.ok) return;
				const data = (await res.json()) as { results: Completion[] };
				suggestions = data.results;
				show = data.results.length > 0;
			} catch (err) {
				console.error('City autocomplete failed:', err);
			}
		}, 250);
	}

	function pick(s: Completion) {
		value = s.subtitle ? `${s.title}, ${s.subtitle}` : s.title;
		suggestions = [];
		show = false;
	}
</script>

<div class="relative">
	<Input
		{id}
		{name}
		type="text"
		{placeholder}
		bind:value
		autocomplete="off"
		oninput={onInput}
		onblur={() => setTimeout(() => (show = false), 150)}
		class="w-full"
	/>
	{#if show}
		<ul
			class="bg-popover absolute inset-x-0 z-20 mt-1 overflow-hidden rounded-md border text-left shadow-md"
		>
			{#each suggestions as s (s.title + s.subtitle)}
				<li>
					<button
						type="button"
						class="hover:bg-accent block w-full px-3 py-2 text-left text-sm"
						onclick={() => pick(s)}
					>
						<span class="font-medium">{s.title}</span>
						{#if s.subtitle}<span class="text-muted-foreground"> · {s.subtitle}</span>{/if}
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</div>
