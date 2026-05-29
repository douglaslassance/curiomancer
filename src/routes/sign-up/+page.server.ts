import { fail, redirect } from '@sveltejs/kit';
import { APIError } from 'better-auth/api';
import { eq } from 'drizzle-orm';
import { auth } from '$lib/server/auth';
import { isAdminEmail } from '$lib/server/admin';
import { db } from '$lib/server/db';
import { user } from '$lib/server/db/schema';
import { findRedeemableInvite, redeemInvite } from '$lib/server/invites';
import type { Actions, PageServerLoad } from './$types';

/**
 * Sign-up is invite-gated. A valid `?invite=<code>` is required unless the
 * signing-up email is on ADMIN_EMAILS — admins bootstrap the system and
 * skip the gate.
 *
 * The load handler resolves the invite (if present) so the form can show
 * the inviter's name as social proof; that doesn't redeem the code, only
 * a successful signup does.
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

	return { code, inviter, inviteState };
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

		const adminBypass = isAdminEmail(email);

		// Admins bootstrap without an invite. Everyone else must present a
		// valid, unredeemed code up-front (we re-check post-create for the
		// redemption to be race-safe).
		if (!adminBypass) {
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

		// Redeem the code atomically. If somebody else grabbed it between the
		// pre-check and now, we roll the user back so the email is free for
		// another attempt.
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
