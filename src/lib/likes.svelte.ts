/**
 * Client-side like store backed by localStorage.
 * v0 only — server-side persistence comes with the auth wiring.
 */
import { browser } from '$app/environment';

const STORAGE_KEY = 'bond:likes';

function load(): Set<string> {
	if (!browser) return new Set();
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return new Set();
		const arr = JSON.parse(raw) as string[];
		return new Set(arr);
	} catch {
		return new Set();
	}
}

function persist(ids: Set<string>) {
	if (!browser) return;
	localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
}

class LikesStore {
	#ids = $state<Set<string>>(new Set());

	constructor() {
		if (browser) this.#ids = load();
	}

	get ids(): ReadonlySet<string> {
		return this.#ids;
	}

	has(id: string): boolean {
		return this.#ids.has(id);
	}

	toggle(id: string) {
		const next = new Set(this.#ids);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		this.#ids = next;
		persist(next);
	}
}

export const likes = new LikesStore();
