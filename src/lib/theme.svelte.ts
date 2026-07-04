/**
 * Theme preference store: 'system' | 'light' | 'dark'.
 *
 * 'system' (the default) follows the OS scheme live - if the user never
 * picks an explicit theme, flipping the OS between light/dark flips the
 * app too. Picking 'light' or 'dark' pins it and persists across sessions.
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

	constructor() {
		if (!browser) return;
		this.#preference = readInitialPreference();
		this.#resolved = resolve(this.#preference);

		// Live-follow the OS while the preference is 'system'; ignored once
		// an explicit light/dark choice is stored.
		window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
			if (this.#preference !== 'system') return;
			this.#resolved = e.matches ? 'dark' : 'light';
			applyToDocument(this.#resolved);
		});
	}

	/** The stored preference: 'system' | 'light' | 'dark'. */
	get preference(): ThemePreference {
		return this.#preference;
	}

	/** The actual scheme in effect right now ('system' resolved to light/dark). */
	get current(): ResolvedTheme {
		return this.#resolved;
	}

	set(next: ThemePreference) {
		this.#preference = next;
		this.#resolved = resolve(next);
		if (browser) {
			localStorage.setItem(STORAGE_KEY, next);
			applyToDocument(this.#resolved);
		}
	}
}

export const theme = new ThemeStore();
