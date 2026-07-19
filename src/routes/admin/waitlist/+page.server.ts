import { fail } from '@sveltejs/kit';
import { and, desc, eq } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { isAdmin } from '$lib/server/admin';
import { db } from '$lib/server/db';
import { invite, waitlist } from '$lib/server/db/schema';
import { sendInviteEmail } from '$lib/server/email';
import { createInviteReturningCode } from '$lib/server/invites';
import { joinWaitlist } from '$lib/server/waitlist';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	// Left-joined so we can tell an invite that's been sent apart from one
	// that's already been redeemed (the waitlist row's own status doesn't
	// change on redemption - only the linked invite does).
	const entries = await db
		.select({
			id: waitlist.id,
			email: waitlist.email,
			city: waitlist.city,
			status: waitlist.status,
			inviteId: waitlist.inviteId,
			createdAt: waitlist.createdAt,
			invitedAt: waitlist.invitedAt,
			redeemedAt: invite.redeemedAt
		})
		.from(waitlist)
		.leftJoin(invite, eq(waitlist.inviteId, invite.id))
		.orderBy(desc(waitlist.createdAt));
	return { entries };
};

export const actions: Actions = {
	add: async ({ request, locals }) => {
		if (!isAdmin(locals.user)) return fail(403, { message: 'Admins only.' });

		const data = await request.formData();
		const email = data.get('email')?.toString() ?? '';
		const city = data.get('city')?.toString() ?? '';

		const result = await joinWaitlist(email, city);
		if (!result.ok) return fail(400, { addError: result.message, email, city });

		return { added: true };
	},

	invite: async ({ request, locals }) => {
		if (!isAdmin(locals.user)) return fail(403, { message: 'Admins only.' });

		const data = await request.formData();
		const id = data.get('id')?.toString() ?? '';

		// Atomically claim the entry (pending -> invited) so a double-submit can't
		// mint two invites for the same person: only the request that flips the
		// status here goes on to mint. inviteId is backfilled once minted.
		const [claimed] = await db
			.update(waitlist)
			.set({ status: 'invited', invitedAt: new Date() })
			.where(and(eq(waitlist.id, id), eq(waitlist.status, 'pending')))
			.returning({ email: waitlist.email });

		if (!claimed) {
			// Lost the race, already invited, or unknown id. Distinguish the last.
			const [entry] = await db.select().from(waitlist).where(eq(waitlist.id, id)).limit(1);
			if (!entry) return fail(404, { message: 'Entry not found.' });
			return { ok: true };
		}

		// Mint an unowned (platform) invite - the admitting admin is recorded as
		// creator, but no one owns it, so it stays out of anyone's Settings and the
		// email reads as a platform invite. Link it to the waitlist entry.
		const code = await createInviteReturningCode(locals.user.id, null);
		await db.update(waitlist).set({ inviteId: code }).where(eq(waitlist.id, id));

		// Best-effort: the invite is already minted and copyable from the admin
		// table, so a delivery hiccup here shouldn't block the admit action.
		try {
			const inviteUrl = `${env.ORIGIN}/sign-up?invite=${encodeURIComponent(code)}`;
			await sendInviteEmail(claimed.email, inviteUrl);
		} catch (err) {
			console.error('Invite email failed:', err);
		}

		return { ok: true };
	},

	remove: async ({ request, locals }) => {
		if (!isAdmin(locals.user)) return fail(403, { message: 'Admins only.' });

		const data = await request.formData();
		const id = data.get('id')?.toString() ?? '';

		await db.delete(waitlist).where(eq(waitlist.id, id));
		return { removed: true };
	}
};
