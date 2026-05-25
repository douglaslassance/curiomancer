/**
 * Client-side like store for *anonymous* visitors only.
 * Signed-in users go through server actions; the layout passes
 * the server-known liked IDs in via `hydrate()` so reactive UI
 * still works without extra fetches.
 */
import { browser } from '$app/environment';

const STORAGE_KEY = 'bond:likes';

function load(): Set<string> {
	if (!browser) return new Set();
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return new Set();
		return new Set(JSON.parse(raw) as string[]);
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
	/** When true, mutations no longer touch localStorage. */
	#serverBacked = $state(false);

	constructor() {
		if (browser) this.#ids = load();
	}

	/** Replace the in-memory set with the server's truth (signed-in mode). */
	hydrateFromServer(ids: Iterable<string>) {
		this.#ids = new Set(ids);
		this.#serverBacked = true;
	}

	/** Reload from localStorage (anonymous mode, e.g. after sign-out). */
	resetToAnonymous() {
		this.#ids = load();
		this.#serverBacked = false;
	}

	get ids(): ReadonlySet<string> {
		return this.#ids;
	}

	get serverBacked(): boolean {
		return this.#serverBacked;
	}

	/** Pop anonymous likes for a one-time merge after sign-in. */
	takeAnonymous(): string[] {
		if (!browser) return [];
		const ids = [...load()];
		if (ids.length > 0) localStorage.removeItem(STORAGE_KEY);
		return ids;
	}

	has(id: string): boolean {
		return this.#ids.has(id);
	}

	/** Optimistically flip locally; server reconciles via hydrateFromServer(). */
	toggle(id: string) {
		const next = new Set(this.#ids);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		this.#ids = next;
		if (!this.#serverBacked) persist(next);
	}
}

export const likes = new LikesStore();
