import { fail } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { isAdmin } from '$lib/server/admin';
import { sendInviteEmail } from '$lib/server/email';
import {
	createInvite,
	deleteInvite,
	getAllInvites,
	hasPendingInviteForEmail,
	isEmailRegistered
} from '$lib/server/invites';
import type { Actions, PageServerLoad } from './$types';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const load: PageServerLoad = async () => {
	const invites = await getAllInvites();
	return { invites };
};

export const actions: Actions = {
	// Create an invite for an email and send it. Admin/waitlist invites are
	// system invites (no creator) - only a user inviting from their own Settings
	// is attributed and named in the email. So this sends the generic email.
	create: async ({ request, locals }) => {
		if (!isAdmin(locals.user)) return fail(403, { message: 'Admins only.' });

		const email =
			(await request.formData()).get('recipient')?.toString().trim().toLowerCase() ?? '';
		if (!EMAIL_RE.test(email)) return fail(400, { inviteError: 'Enter a valid email address.' });

		if (await isEmailRegistered(email)) {
			return fail(400, { inviteError: 'That person is already on Curiomancer.' });
		}
		if (await hasPendingInviteForEmail(email)) {
			return fail(400, { inviteError: 'That email already has a pending invite.' });
		}

		const code = await createInvite(null, email);

		// Best-effort: the invite exists and is copyable from the table, so a
		// delivery hiccup shouldn't fail the action.
		try {
			const inviteUrl = `${env.ORIGIN}/sign-up?invite=${encodeURIComponent(code)}`;
			await sendInviteEmail(email, inviteUrl);
		} catch (err) {
			console.error('Invite email failed:', err);
		}
		return { invited: email };
	},

	delete: async ({ request, locals }) => {
		if (!isAdmin(locals.user)) return fail(403, { message: 'Admins only.' });

		const id = (await request.formData()).get('id')?.toString() ?? '';
		if (!id) return fail(400, { message: 'Missing invite code.' });

		const removed = await deleteInvite(id);
		if (!removed) return fail(404, { message: 'Invite not found.' });
		return { deleted: true };
	}
};
