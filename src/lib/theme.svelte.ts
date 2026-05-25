/**
 * Theme preference store: 'light' | 'dark' | 'system'.
 *
 * The actual class on <html> is set by an inline script in app.html that
 * runs before hydration (to prevent a flash of the wrong theme). This
 * store stays in sync with that script's logic so subsequent toggles
 * just update the class and persist the choice to localStorage.
 */
import { browser } from '$app/environment';

const STORAGE_KEY = 'bond:theme';

export type ThemePreference = 'light' | 'dark' | 'system';

function readStored(): ThemePreference {
	if (!browser) return 'system';
	const raw = localStorage.getItem(STORAGE_KEY);
	if (raw === 'light' || raw === 'dark' || raw === 'system') return raw;
	return 'system';
}

function systemPrefersDark(): boolean {
	if (!browser) return false;
	return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function applyToDocument(preference: ThemePreference) {
	if (!browser) return;
	const effective = preference === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : preference;
	const root = document.documentElement;
	root.classList.toggle('dark', effective === 'dark');
	root.style.colorScheme = effective;
}

class ThemeStore {
	#preference = $state<ThemePreference>('system');

	constructor() {
		if (browser) {
			this.#preference = readStored();
			// Re-apply when the system preference changes (only matters when
			// the user is on 'system'; harmless otherwise).
			window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
				if (this.#preference === 'system') applyToDocument('system');
			});
		}
	}

	get preference(): ThemePreference {
		return this.#preference;
	}

	get effective(): 'light' | 'dark' {
		if (this.#preference === 'system') return systemPrefersDark() ? 'dark' : 'light';
		return this.#preference;
	}

	set(preference: ThemePreference) {
		this.#preference = preference;
		if (browser) {
			localStorage.setItem(STORAGE_KEY, preference);
			applyToDocument(preference);
		}
	}
}

export const theme = new ThemeStore();
