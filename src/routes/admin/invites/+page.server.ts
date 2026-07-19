import { fail } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { isAdmin } from '$lib/server/admin';
import { db } from '$lib/server/db';
import { user } from '$lib/server/db/schema';
import {
	clearInviteCreator,
	clearInviteOwner,
	createInviteReturningCode,
	deleteInvite,
	getAllInvites
} from '$lib/server/invites';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	// Owners are searched on demand (see ./search) rather than shipped in bulk -
	// there can be thousands of users. `self` powers the "Yourself" shortcut.
	const invites = await getAllInvites();
	return {
		invites,
		self: locals.user ? { id: locals.user.id, name: locals.user.name } : null
	};
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		if (!isAdmin(locals.user)) return fail(403, { message: 'Admins only.' });

		const data = await request.formData();
		// Owner defaults to none (unowned/platform invite); a picked owner must be
		// a real user. The acting admin is recorded as creator regardless.
		const ownerId = data.get('ownerId')?.toString() || null;
		if (ownerId) {
			const [owner] = await db
				.select({ id: user.id })
				.from(user)
				.where(eq(user.id, ownerId))
				.limit(1);
			if (!owner) return fail(400, { message: 'Pick a valid owner.' });
		}

		const code = await createInviteReturningCode(locals.user.id, ownerId);
		return { ok: true, code };
	},

	clearOwner: async ({ request, locals }) => {
		if (!isAdmin(locals.user)) return fail(403, { message: 'Admins only.' });
		const id = (await request.formData()).get('id')?.toString() ?? '';
		if (!id) return fail(400, { message: 'Missing invite code.' });
		await clearInviteOwner(id);
		return { ownerCleared: true };
	},

	clearCreator: async ({ request, locals }) => {
		if (!isAdmin(locals.user)) return fail(403, { message: 'Admins only.' });
		const id = (await request.formData()).get('id')?.toString() ?? '';
		if (!id) return fail(400, { message: 'Missing invite code.' });
		await clearInviteCreator(id);
		return { creatorCleared: true };
	},

	delete: async ({ request, locals }) => {
		if (!isAdmin(locals.user)) return fail(403, { message: 'Admins only.' });

		const data = await request.formData();
		const id = data.get('id')?.toString() ?? '';
		if (!id) return fail(400, { message: 'Missing invite code.' });

		const removed = await deleteInvite(id);
		if (!removed) return fail(404, { message: 'Invite not found.' });
		return { deleted: true };
	}
};
