import { fail, redirect } from '@sveltejs/kit';
import { APIError } from 'better-auth/api';
import { eq } from 'drizzle-orm';
import { auth } from '$lib/server/auth';
import { canBootstrapAs, hasAnyAdmin, isAdminEmail } from '$lib/server/admin';
import { db } from '$lib/server/db';
import { user } from '$lib/server/db/schema';
import { findRedeemableInvite, redeemInvite } from '$lib/server/invites';
import type { Actions, PageServerLoad } from './$types';

/**
 * Sign-up is invite-gated, with two escape hatches:
 *
 *  - Email is on ADMIN_EMAILS → skip the gate, get role='admin' at create.
 *  - The database has no admin yet → first-run bootstrap. Anybody (or any
 *    email on ADMIN_EMAILS if that's set) can sign up without an invite
 *    and is promoted to admin afterward. The bootstrap auto-disables once
 *    an admin exists.
 *
 * The load handler resolves the invite if one is present, and announces
 * bootstrap mode to the page so the UI can speak the right language.
 */
export const load: PageServerLoad = async (event) => {
	if (event.locals.user) throw redirect(302, '/');

	const code = event.url.searchParams.get('invite')?.trim() ?? null;
	let inviter: { name: string } | null = null;
	let inviteState: 'absent' | 'valid' | 'invalid' = 'absent';

	if (code) {
		const row = await findRedeemableInvite(code);
		if (row) {
			const [u] = await db
				.select({ name: user.name })
				.from(user)
				.where(eq(user.id, row.createdByUserId))
				.limit(1);
			if (u) {
				inviter = { name: u.name };
				inviteState = 'valid';
			} else {
				inviteState = 'invalid';
			}
		} else {
			inviteState = 'invalid';
		}
	}

	const bootstrapMode = !(await hasAnyAdmin());

	return { code, inviter, inviteState, bootstrapMode };
};

export const actions: Actions = {
	default: async (event) => {
		const data = await event.request.formData();
		const name = data.get('name')?.toString() ?? '';
		const email = data.get('email')?.toString() ?? '';
		const password = data.get('password')?.toString() ?? '';
		const code = data.get('invite')?.toString().trim() || null;

		if (!name || !email || !password) {
			return fail(400, { name, email, message: 'All fields are required.' });
		}
		if (password.length < 8) {
			return fail(400, {
				name,
				email,
				message: 'Password must be at least 8 characters.'
			});
		}

		// Re-check bootstrap mode at action time — the world might've changed
		// between the load and the submit.
		const bootstrapMode = !(await hasAnyAdmin());
		const allowedToBootstrap = bootstrapMode && canBootstrapAs(email);
		const adminBypass = allowedToBootstrap || isAdminEmail(email);

		// Anyone not bypassing must present a valid, unredeemed code up-front.
		// The redemption itself happens post-create for race safety.
		if (!adminBypass) {
			if (bootstrapMode) {
				// Bootstrap mode is on but this email isn't on the allow-list —
				// gently steer them toward asking the operator.
				return fail(403, {
					name,
					email,
					message: 'Bond is being set up. Only configured admin emails can sign up right now.'
				});
			}
			if (!code) {
				return fail(400, {
					name,
					email,
					message: 'Bond is invite-only. You need a code from a friend on Bond.'
				});
			}
			const existing = await findRedeemableInvite(code);
			if (!existing) {
				return fail(400, {
					name,
					email,
					message: 'That invite code is invalid or already used.'
				});
			}
		}

		let newUserId: string | null;
		try {
			const result = await auth.api.signUpEmail({ body: { name, email, password } });
			newUserId = result?.user?.id ?? null;
		} catch (error) {
			if (error instanceof APIError) {
				return fail(400, {
					name,
					email,
					message: error.message || 'Sign-up failed.'
				});
			}
			return fail(500, {
				name,
				email,
				message: 'Unexpected error. Try again.'
			});
		}

		// Bootstrap: promote the just-created user to admin. (For ADMIN_EMAILS
		// matches the auth hook already did this; for first-run we have to.)
		if (allowedToBootstrap && newUserId) {
			await db.update(user).set({ role: 'admin' }).where(eq(user.id, newUserId));
		}

		// Redeem the invite atomically; if somebody beat us to it, roll back
		// so the email is free for another attempt.
		if (!adminBypass && code && newUserId) {
			const redeemed = await redeemInvite(code, newUserId);
			if (!redeemed) {
				await db.delete(user).where(eq(user.id, newUserId));
				return fail(400, {
					name,
					email,
					message: 'That invite was just used by someone else. Try another.'
				});
			}
		}

		throw redirect(302, '/');
	}
};
