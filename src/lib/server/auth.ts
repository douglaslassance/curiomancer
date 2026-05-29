import { betterAuth } from 'better-auth/minimal';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { eq } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { getRequestEvent } from '$app/server';
import { db } from '$lib/server/db';
import { user } from '$lib/server/db/schema';
import { isAdminEmail } from '$lib/server/admin';
import { createInvitesFor } from '$lib/server/invites';

export const auth = betterAuth({
	baseURL: env.ORIGIN,
	secret: env.BETTER_AUTH_SECRET,
	database: drizzleAdapter(db, { provider: 'pg' }),
	emailAndPassword: { enabled: true },
	user: {
		additionalFields: {
			/**
			 * 'user' (default) or 'admin'. Admins skip the invite-gated signup
			 * (their email is checked against ADMIN_EMAILS at create-time) and
			 * get access to the /admin panel.
			 */
			role: { type: 'string', defaultValue: 'user', input: false },
			instagram: { type: 'string', required: false }
		}
	},
	databaseHooks: {
		user: {
			create: {
				after: async (newUser) => {
					if (isAdminEmail(newUser.email)) {
						await db.update(user).set({ role: 'admin' }).where(eq(user.id, newUser.id));
					}
					await createInvitesFor(newUser.id, 3);
				}
			}
		}
	},
	plugins: [
		sveltekitCookies(getRequestEvent) // must remain last
	]
});
