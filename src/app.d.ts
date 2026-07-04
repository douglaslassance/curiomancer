import type { User, Session } from 'better-auth/minimal';

// Extend the better-auth User type with our additionalFields. Keeping this
// in app.d.ts (rather than a re-exported type) means every consumer of
// locals.user / data.user automatically sees role.
type CuriomancerUser = User & {
	role?: 'user' | 'admin';
	messageable?: boolean;
};

// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		interface Locals {
			user?: CuriomancerUser;
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
