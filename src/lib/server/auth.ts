import { betterAuth } from 'better-auth/minimal';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { env } from '$env/dynamic/private';
import { getRequestEvent } from '$app/server';
import { db } from '$lib/server/db';
import { createInvitesFor } from '$lib/server/invites';
import { sendPasswordResetEmail, sendVerificationEmail } from '$lib/server/email';

export const auth = betterAuth({
	baseURL: env.ORIGIN,
	secret: env.BETTER_AUTH_SECRET,
	database: drizzleAdapter(db, { provider: 'pg' }),
	emailAndPassword: {
		enabled: true,
		requireEmailVerification: true,
		// Called when a user requests a reset. We build the link straight to our
		// own /reset-password page with the raw token (which resetPassword()
		// validates directly), rather than better-auth's /api/auth callback URL -
		// this app serves auth through server actions, not the HTTP auth routes.
		sendResetPassword: async ({ user, token }) => {
			const resetUrl = `${env.ORIGIN}/reset-password?token=${encodeURIComponent(token)}`;
			await sendPasswordResetEmail(user.email, resetUrl);
		}
	},
	// Unlike sendResetPassword above, `url` here already points at better-auth's
	// own /api/auth/verify-email route (served by svelteKitHandler in
	// hooks.server.ts), since that endpoint sets the session cookie itself on
	// success (autoSignInAfterVerification) - a server action can't propagate that.
	emailVerification: {
		sendOnSignUp: true,
		sendOnSignIn: true,
		autoSignInAfterVerification: true,
		sendVerificationEmail: async ({ user, url }) => {
			await sendVerificationEmail(user.email, url);
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
