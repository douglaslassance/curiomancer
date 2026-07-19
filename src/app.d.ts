import type { User, Session } from 'better-auth/minimal';

// Extend the better-auth User type with our additionalFields. Keeping this
// in app.d.ts (rather than a re-exported type) means every consumer of
// locals.user / data.user automatically sees role.
type CuriomancerUser = User & {
	role?: 'user' | 'admin';
	incognito?: boolean;
};

// Set when the admin plugin's impersonateUser created this session - the id
// of the admin who's impersonating. Used to show a "stop impersonating"
// banner; see src/routes/+layout.svelte.
type CuriomancerSession = Session & {
	impersonatedBy?: string | null;
};

// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		interface Locals {
			user?: CuriomancerUser;
			session?: CuriomancerSession;
		}

		// Optional rich-link (Open Graph) overrides a page can return from its
		// load; the root layout renders one set of OG/Twitter tags from these,
		// falling back to site-wide defaults. See src/routes/+layout.svelte.
		interface PageData {
			meta?: { title?: string; description?: string };
		}

		// interface Error {}
		// interface PageState {}
		// interface Platform {}
	}

	// Apple MapKit JS is loaded from a CDN at runtime; we use it untyped for now.
	// If we lean harder on it, swap this for a proper d.ts.
	interface Window {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		mapkit?: any;
	}
}

export {};
