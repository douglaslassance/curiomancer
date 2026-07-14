import { fail } from '@sveltejs/kit';
import { isAdmin } from '$lib/server/admin';
import { createInviteReturningCode, getAllInvites } from '$lib/server/invites';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const invites = await getAllInvites();
	return { invites };
};

export const actions: Actions = {
	create: async ({ locals }) => {
		if (!isAdmin(locals.user)) return fail(403, { message: 'Admins only.' });

		// Mint a fresh invite owned by the admin, not tied to any waitlist entry.
		const code = await createInviteReturningCode(locals.user.id);
		return { ok: true, code };
	}
};
