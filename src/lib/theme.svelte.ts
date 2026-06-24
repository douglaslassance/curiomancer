/**
 * Theme preference store: 'light' | 'dark'.
 *
 * Initial value follows the OS preference. The first toggle locks in an
 * explicit choice that persists across sessions. Subsequent OS changes
 * don't override your stored preference - once you've picked, you've
 * picked. This matches the pattern from douglaslassance.me.
 *
 * The actual class on <html> is set by an inline script in app.html that
 * runs before hydration so we never flash the wrong theme.
 */
import { browser } from '$app/environment';

const STORAGE_KEY = 'curiomancer:theme';

export type Theme = 'light' | 'dark';

function systemPrefersDark(): boolean {
	if (!browser) return false;
	return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function readInitial(): Theme {
	if (!browser) return 'light';
	const raw = localStorage.getItem(STORAGE_KEY);
	if (raw === 'light' || raw === 'dark') return raw;
	return systemPrefersDark() ? 'dark' : 'light';
}

function applyToDocument(theme: Theme) {
	if (!browser) return;
	const root = document.documentElement;
	root.classList.toggle('dark', theme === 'dark');
	root.style.colorScheme = theme;
}

class ThemeStore {
	#current = $state<Theme>('light');

	constructor() {
		if (browser) this.#current = readInitial();
	}

	get current(): Theme {
		return this.#current;
	}

	toggle() {
		this.set(this.#current === 'dark' ? 'light' : 'dark');
	}

	set(next: Theme) {
		this.#current = next;
		if (browser) {
			localStorage.setItem(STORAGE_KEY, next);
			applyToDocument(next);
		}
	}
}

export const theme = new ThemeStore();
