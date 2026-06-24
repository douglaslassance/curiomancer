import { betterAuth } from 'better-auth/minimal';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { env } from '$env/dynamic/private';
import { getRequestEvent } from '$app/server';
import { db } from '$lib/server/db';

export const auth = betterAuth({
	baseURL: env.ORIGIN,
	secret: env.BETTER_AUTH_SECRET,
	database: drizzleAdapter(db, { provider: 'pg' }),
	emailAndPassword: { enabled: true },
	user: {
		additionalFields: {
			/**
			 * 'user' (default) or 'admin'. The first admin is created via
			 * /setup; subsequent promotions happen through the /admin panel.
			 */
			role: { type: 'string', defaultValue: 'user', input: false },
			instagram: { type: 'string', required: false }
		}
	},
	plugins: [
		sveltekitCookies(getRequestEvent) // must remain last
	]
});
