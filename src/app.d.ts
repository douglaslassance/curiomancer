import type { User, Session } from 'better-auth/minimal';

// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		interface Locals {
			user?: User;
			session?: Session;
		}

		// interface Error {}
		// interface PageData {}
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
