import { betterAuth } from 'better-auth/minimal';
import { admin } from 'better-auth/plugins';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { env } from '$env/dynamic/private';
import { getRequestEvent } from '$app/server';
import { db } from '$lib/server/db';
import { createInvitesFor } from '$lib/server/invites';
import {
	sendChangeEmailVerificationEmail,
	sendPasswordResetEmail,
	sendVerificationEmail
} from '$lib/server/email';

/**
 * Rewrite the `callbackURL` on a better-auth verification link so the user
 * lands where we want after clicking. Falls back to the original URL if it
 * can't be parsed.
 */
function withCallback(url: string, callbackPath: string): string {
	try {
		const u = new URL(url);
		u.searchParams.set('callbackURL', callbackPath);
		return u.toString();
	} catch {
		return url;
	}
}

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
			// A verification link for an already-verified user means they're
			// confirming a NEW address for an email change: better-auth invokes this
			// with the new email as `user.email` (see user.changeEmail below). An
			// unverified user is finishing sign-up, so it gets the sign-up copy.
			if (user.emailVerified) {
				await sendChangeEmailVerificationEmail(user.email, url);
			} else {
				// autoSignInAfterVerification signs them in when they click, so send
				// them straight into onboarding (the skippable import wizard) rather
				// than the default landing.
				await sendVerificationEmail(user.email, withCallback(url, '/onboarding'));
			}
		}
	},
	user: {
		additionalFields: {
			/** Whether other users can start a chat with them. Set from Settings. */
			messageable: { type: 'boolean', defaultValue: true }
		},
		// Let users change their email from Settings. With no confirmation hook set,
		// a verified user gets a single verification link sent to the NEW address;
		// the change only applies once they click it (their current email stays put
		// until then). See sendVerificationEmail above for the routing.
		changeEmail: {
			enabled: true
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
		// Owns `role` (defaultRole 'user' / adminRoles ['admin'] - matches our
		// existing convention exactly) plus impersonateUser/stopImpersonating,
		// used from /admin/users in dev only. The first admin is still created
		// via /setup; subsequent promotions happen through the /admin panel.
		admin(),
		sveltekitCookies(getRequestEvent) // must remain last
	]
});
