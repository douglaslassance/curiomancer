/**
 * Theme preference store: 'system' | 'light' | 'dark'.
 *
 * 'system' (the default) follows the OS scheme live - if the user never
 * picks an explicit theme, flipping the OS between light/dark flips the
 * app too. Picking 'light' or 'dark' pins it and persists across sessions.
 *
 * The preference is only picked up (via /settings) while signed in.
 * Signed-out visitors - the marketing page, sign-in/up, etc. - always get
 * 'system' regardless of what's stored, so a stored preference from a
 * previous session never leaks into the logged-out experience. See
 * `setLoggedIn` and the matching correction script in +layout.svelte's
 * <svelte:head>, which re-applies 'system' before hydration for anonymous
 * requests (the inline script in app.html can't know auth state).
 *
 * The actual class on <html> is set by an inline script in app.html that
 * runs before hydration so we never flash the wrong theme.
 */
import { browser } from '$app/environment';

const STORAGE_KEY = 'curiomancer:theme';

export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

function systemPrefersDark(): boolean {
	if (!browser) return false;
	return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function readInitialPreference(): ThemePreference {
	if (!browser) return 'system';
	const raw = localStorage.getItem(STORAGE_KEY);
	if (raw === 'light' || raw === 'dark' || raw === 'system') return raw;
	return 'system';
}

function resolve(preference: ThemePreference): ResolvedTheme {
	return preference === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : preference;
}

function applyToDocument(resolved: ResolvedTheme) {
	if (!browser) return;
	const root = document.documentElement;
	root.classList.toggle('dark', resolved === 'dark');
	root.style.colorScheme = resolved;
}

class ThemeStore {
	#preference = $state<ThemePreference>('system');
	#resolved = $state<ResolvedTheme>('light');
	#loggedIn = $state(false);

	constructor() {
		if (!browser) return;
		this.#preference = readInitialPreference();
		this.#resolved = resolve(this.#preference);

		// Live-follow the OS while the preference is 'system'; ignored once
		// an explicit light/dark choice is stored.
		window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
			if (this.#preference !== 'system') return;
			this.#resolved = e.matches ? 'dark' : 'light';
			applyToDocument(this.current);
		});
	}

	/** The stored preference: 'system' | 'light' | 'dark'. */
	get preference(): ThemePreference {
		return this.#preference;
	}

	/**
	 * The actual scheme in effect right now. Forced to the system scheme
	 * while signed out, no matter what preference is stored.
	 */
	get current(): ResolvedTheme {
		return this.#loggedIn ? this.#resolved : resolve('system');
	}

	/** Called from the root layout whenever auth state changes. */
	setLoggedIn(loggedIn: boolean) {
		if (this.#loggedIn === loggedIn) return;
		this.#loggedIn = loggedIn;
		applyToDocument(this.current);
	}

	set(next: ThemePreference) {
		this.#preference = next;
		this.#resolved = resolve(next);
		if (browser) {
			localStorage.setItem(STORAGE_KEY, next);
			applyToDocument(this.current);
		}
	}
}

export const theme = new ThemeStore();
