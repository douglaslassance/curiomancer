import { fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { user } from '$lib/server/db/schema';
import { findRedeemableInvite } from '$lib/server/invites';
import { createInvitedUser } from '$lib/server/signup';
import type { Actions, PageServerLoad } from './$types';

/**
 * Sign-up is strictly invite-gated. The very first admin comes in
 * through /setup (only available when the DB has zero users); after
 * that the only way in is a valid, unredeemed invite code.
 */
export const load: PageServerLoad = async (event) => {
	if (event.locals.user) throw redirect(302, '/');

	// If no users exist yet, send them to /setup instead. Avoids confusing
	// "invite required" copy when there are literally no inviters.
	const [firstUser] = await db.select({ id: user.id }).from(user).limit(1);
	if (!firstUser) throw redirect(302, '/setup');

	const code = event.url.searchParams.get('invite')?.trim() ?? null;
	let inviter: { name: string } | null = null;
	let inviteState: 'absent' | 'valid' | 'invalid' = 'absent';
	// The address this invite is bound to. Signup is locked to it, and the form
	// prefills it so the invited person doesn't type (or mistype) anything.
	let invitedEmail: string | null = null;

	if (code) {
		const row = await findRedeemableInvite(code);
		if (row) {
			// A redeemable code is valid regardless of creator. If a real user
			// created it, show them as the inviter; system invites stay generic.
			inviteState = 'valid';
			invitedEmail = row.invitedEmail;
			if (row.createdByUserId) {
				const [u] = await db
					.select({ name: user.name })
					.from(user)
					.where(eq(user.id, row.createdByUserId))
					.limit(1);
				if (u) inviter = { name: u.name };
			}
		} else {
			inviteState = 'invalid';
		}
	}

	return { code, inviter, inviteState, invitedEmail };
};

export const actions: Actions = {
	default: async (event) => {
		const data = await event.request.formData();
		const name = data.get('name')?.toString() ?? '';
		const email = data.get('email')?.toString() ?? '';

		const result = await createInvitedUser({
			name,
			email,
			password: data.get('password')?.toString() ?? '',
			code: data.get('invite')?.toString().trim() || null,
			city: data.get('city')?.toString().trim() ?? '',
			latitude: data.get('latitude')?.toString() ?? '',
			longitude: data.get('longitude')?.toString() ?? ''
		});

		// Repopulate name/email on failure so the form doesn't clear.
		if (!result.ok) return fail(result.status, { name, email, message: result.message });

		// requireEmailVerification means sign-up doesn't create a session, so
		// there's nothing to redirect into yet - show a "check your email" state.
		return { verifyEmailSent: true, email: result.email };
	}
};
