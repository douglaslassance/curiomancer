import { fail } from '@sveltejs/kit';
import { desc, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { waitlist } from '$lib/server/db/schema';
import { createInviteReturningCode } from '$lib/server/invites';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const entries = await db.select().from(waitlist).orderBy(desc(waitlist.createdAt));
	return { entries };
};

export const actions: Actions = {
	invite: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { message: 'Not signed in.' });

		const data = await request.formData();
		const id = data.get('id')?.toString() ?? '';

		const [entry] = await db.select().from(waitlist).where(eq(waitlist.id, id)).limit(1);
		if (!entry) return fail(404, { message: 'Entry not found.' });
		if (entry.status === 'invited') return { ok: true };

		// Mint an invite owned by the admitting admin, then mark the entry.
		const code = await createInviteReturningCode(locals.user.id);
		await db
			.update(waitlist)
			.set({ status: 'invited', inviteId: code, invitedAt: new Date() })
			.where(eq(waitlist.id, id));

		return { ok: true };
	}
};
