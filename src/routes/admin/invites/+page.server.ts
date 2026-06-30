import { fail } from '@sveltejs/kit';
import { createInviteReturningCode, getAllInvites } from '$lib/server/invites';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const invites = await getAllInvites();
	return { invites };
};

export const actions: Actions = {
	create: async ({ locals }) => {
		if (!locals.user) return fail(401, { message: 'Not signed in.' });

		// Mint a fresh invite owned by the admin, not tied to any waitlist entry.
		const code = await createInviteReturningCode(locals.user.id);
		return { ok: true, code };
	}
};
