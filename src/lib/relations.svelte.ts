/**
 * Client-side store of the current user's place relations: liked + disliked.
 * (Want-to-go is omitted for now — it's a future feature that doesn't
 * affect matching.)
 *
 * Anonymous users get localStorage persistence for *likes only* — we never
 * persist dislikes anonymously because dislike of a specific spot you
 * haven't been to is meaningless without an account context.
 *
 * For signed-in users the store is replaced from the server's truth via
 * `hydrateFromServer` on every page navigation; mutations are optimistic
 * and reconcile after a successful API round-trip.
 */
import { browser } from '$app/environment';

const STORAGE_KEY = 'bond:likes';

export type Kind = 'liked' | 'disliked';

function loadAnonymousLikes(): Set<string> {
	if (!browser) return new Set();
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return new Set();
		return new Set(JSON.parse(raw) as string[]);
	} catch {
		return new Set();
	}
}

function persistAnonymousLikes(ids: Set<string>) {
	if (!browser) return;
	localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
}

class RelationsStore {
	#liked = $state<Set<string>>(new Set());
	#disliked = $state<Set<string>>(new Set());
	#serverBacked = $state(false);

	constructor() {
		if (browser) this.#liked = loadAnonymousLikes();
	}

	hydrateFromServer(snapshot: { liked: Iterable<string>; disliked: Iterable<string> }) {
		this.#liked = new Set(snapshot.liked);
		this.#disliked = new Set(snapshot.disliked);
		this.#serverBacked = true;
	}

	resetToAnonymous() {
		this.#liked = loadAnonymousLikes();
		this.#disliked = new Set();
		this.#serverBacked = false;
	}

	get serverBacked(): boolean {
		return this.#serverBacked;
	}

	/** Pop anonymous likes for a one-time merge after sign-in. */
	takeAnonymousLikes(): string[] {
		if (!browser) return [];
		const ids = [...loadAnonymousLikes()];
		if (ids.length > 0) localStorage.removeItem(STORAGE_KEY);
		return ids;
	}

	/** Current relation for a place, or null if none. */
	kindOf(placeId: string): Kind | null {
		if (this.#liked.has(placeId)) return 'liked';
		if (this.#disliked.has(placeId)) return 'disliked';
		return null;
	}

	/**
	 * Apply a kind locally; signed-out users only get to like (matching the
	 * existing behavior). Toggle semantics: applying the same kind clears
	 * it.
	 */
	apply(placeId: string, kind: Kind): Kind | null {
		const current = this.kindOf(placeId);
		const next: Kind | null = current === kind ? null : kind;

		const newLiked = new Set(this.#liked);
		const newDisliked = new Set(this.#disliked);
		newLiked.delete(placeId);
		newDisliked.delete(placeId);
		if (next === 'liked') newLiked.add(placeId);
		else if (next === 'disliked') newDisliked.add(placeId);

		this.#liked = newLiked;
		this.#disliked = newDisliked;
		if (!this.#serverBacked) persistAnonymousLikes(newLiked);
		return next;
	}
}

export const relations = new RelationsStore();
