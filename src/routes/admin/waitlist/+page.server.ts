import { fail } from '@sveltejs/kit';
import { desc, eq } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { db } from '$lib/server/db';
import { waitlist } from '$lib/server/db/schema';
import { sendInviteEmail } from '$lib/server/email';
import { createInviteReturningCode } from '$lib/server/invites';
import { joinWaitlist } from '$lib/server/waitlist';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const entries = await db.select().from(waitlist).orderBy(desc(waitlist.createdAt));
	return { entries };
};

export const actions: Actions = {
	add: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { message: 'Not signed in.' });

		const data = await request.formData();
		const email = data.get('email')?.toString() ?? '';
		const city = data.get('city')?.toString() ?? '';

		const result = await joinWaitlist(email, city);
		if (!result.ok) return fail(400, { addError: result.message, email, city });

		return { added: true };
	},

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

		// Best-effort: the invite is already minted and copyable from the admin
		// table, so a delivery hiccup here shouldn't block the admit action.
		try {
			const inviteUrl = `${env.ORIGIN}/sign-up?invite=${encodeURIComponent(code)}`;
			await sendInviteEmail(entry.email, inviteUrl);
		} catch (err) {
			console.error('Invite email failed:', err);
		}

		return { ok: true };
	}
};
