import { betterAuth } from 'better-auth/minimal';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { env } from '$env/dynamic/private';
import { getRequestEvent } from '$app/server';
import { db } from '$lib/server/db';
import { createInvitesFor } from '$lib/server/invites';
import { sendPasswordResetEmail } from '$lib/server/email';

export const auth = betterAuth({
	baseURL: env.ORIGIN,
	secret: env.BETTER_AUTH_SECRET,
	database: drizzleAdapter(db, { provider: 'pg' }),
	emailAndPassword: {
		enabled: true,
		// Called when a user requests a reset. We build the link straight to our
		// own /reset-password page with the raw token (which resetPassword()
		// validates directly), rather than better-auth's /api/auth callback URL -
		// this app serves auth through server actions, not the HTTP auth routes.
		sendResetPassword: async ({ user, token }) => {
			const resetUrl = `${env.ORIGIN}/reset-password?token=${encodeURIComponent(token)}`;
			await sendPasswordResetEmail(user.email, resetUrl);
		}
	},
	user: {
		additionalFields: {
			/**
			 * 'user' (default) or 'admin'. The first admin is created via
			 * /setup; subsequent promotions happen through the /admin panel.
			 */
			role: { type: 'string', defaultValue: 'user', input: false }
		}
	},
	databaseHooks: {
		user: {
			create: {
				after: async (newUser) => {
					await createInvitesFor(newUser.id, 3);
				}
			}
		}
	},
	plugins: [
		sveltekitCookies(getRequestEvent) // must remain last
	]
});
