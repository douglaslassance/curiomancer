/**
 * Invite management - creation, redemption, listing.
 *
 * A user invites a friend by email: we mint a code, record who created it and
 * the recipient email, and send them an invite link (see email.ts / the create
 * actions). A user may have up to `user.invite_limit` invites outstanding
 * (pending + redeemed); cancelling a pending one frees a slot. Waitlist admits
 * mint an invite with no creator (the system). Redemption links the code to the
 * new user via `redeemedByUserId`.
 */
import { and, count, eq, isNull, sql } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { db } from './db';
import { invite, user, waitlist } from './db/schema';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
const CODE_LEN = 12;
const CODE_GROUP = 4;

function generateInviteCode(): string {
	const bytes = randomBytes(CODE_LEN);
	let raw = '';
	for (let i = 0; i < CODE_LEN; i++) {
		raw += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
	}
	// Format as ABCD-EFGH-IJKL for readability.
	const groups: string[] = [];
	for (let i = 0; i < raw.length; i += CODE_GROUP) {
		groups.push(raw.slice(i, i + CODE_GROUP));
	}
	return groups.join('-');
}

/**
 * Mint one invite and return its code. `createdByUserId` is the creator (a real
 * user inviting a friend / an admin, or null for a system/waitlist invite);
 * `invitedEmail` is who it's for. Sending the email is the caller's job.
 */
export async function createInvite(
	createdByUserId: string | null,
	invitedEmail: string | null
): Promise<string> {
	const code = generateInviteCode();
	await db.insert(invite).values({ id: code, createdByUserId, invitedEmail });
	return code;
}

/** How many invites `userId` has created (pending + redeemed) - their quota use. */
export async function countInvitesCreatedBy(userId: string): Promise<number> {
	const [row] = await db
		.select({ n: count() })
		.from(invite)
		.where(eq(invite.createdByUserId, userId));
	return row?.n ?? 0;
}

/** True if `email` already belongs to a registered account (case-insensitive). */
export async function isEmailRegistered(email: string): Promise<boolean> {
	const [row] = await db
		.select({ id: user.id })
		.from(user)
		.where(sql`lower(${user.email}) = ${email.toLowerCase()}`)
		.limit(1);
	return !!row;
}

/** True if `email` already has a still-pending invite (avoid duplicate sends). */
export async function hasPendingInviteForEmail(email: string): Promise<boolean> {
	const [row] = await db
		.select({ id: invite.id })
		.from(invite)
		.where(and(eq(invite.invitedEmail, email.toLowerCase()), isNull(invite.redeemedByUserId)))
		.limit(1);
	return !!row;
}

export type InviteWithRedeemer = {
	id: string;
	createdAt: Date;
	invitedEmail: string | null;
	redeemedByUserId: string | null;
	redeemedAt: Date | null;
	redeemedByName: string | null;
};

/** Invites a user created, newest first, with recipient email + redeemer name. */
export async function getInvitesFor(userId: string): Promise<InviteWithRedeemer[]> {
	const rows = await db.execute<{
		id: string;
		created_at: Date;
		invited_email: string | null;
		redeemed_by_user_id: string | null;
		redeemed_at: Date | null;
		redeemed_by_name: string | null;
	}>(sql`
		SELECT
			i.id,
			i.created_at,
			i.invited_email,
			i.redeemed_by_user_id,
			i.redeemed_at,
			u.name AS redeemed_by_name
		FROM "invite" i
		LEFT JOIN "user" u ON u.id = i.redeemed_by_user_id
		WHERE i.created_by_user_id = ${userId}
		ORDER BY i.created_at DESC
	`);
	return rows.map((r) => ({
		id: r.id,
		createdAt: new Date(r.created_at),
		invitedEmail: r.invited_email,
		redeemedByUserId: r.redeemed_by_user_id,
		redeemedAt: r.redeemed_at ? new Date(r.redeemed_at) : null,
		redeemedByName: r.redeemed_by_name
	}));
}

export type InviteLedgerRow = {
	id: string;
	createdAt: Date;
	// Who created it (its `createdByUserId`). Null = system (a waitlist admit).
	creatorName: string | null;
	// Who the invite was sent to (its `invitedEmail`).
	invitedEmail: string | null;
	redeemedByUserId: string | null;
	redeemedAt: Date | null;
	redeemedByName: string | null;
};

/** Every invite in the system, newest first, with creator, recipient, redeemer. */
export async function getAllInvites(): Promise<InviteLedgerRow[]> {
	const rows = await db.execute<{
		id: string;
		created_at: Date;
		creator_name: string | null;
		invited_email: string | null;
		redeemed_by_user_id: string | null;
		redeemed_at: Date | null;
		redeemed_by_name: string | null;
	}>(sql`
		SELECT
			i.id,
			i.created_at,
			c.name AS creator_name,
			i.invited_email,
			i.redeemed_by_user_id,
			i.redeemed_at,
			r.name AS redeemed_by_name
		FROM "invite" i
		LEFT JOIN "user" c ON c.id = i.created_by_user_id
		LEFT JOIN "user" r ON r.id = i.redeemed_by_user_id
		ORDER BY i.created_at DESC
	`);
	return rows.map((r) => ({
		id: r.id,
		createdAt: new Date(r.created_at),
		creatorName: r.creator_name,
		invitedEmail: r.invited_email,
		redeemedByUserId: r.redeemed_by_user_id,
		redeemedAt: r.redeemed_at ? new Date(r.redeemed_at) : null,
		redeemedByName: r.redeemed_by_name
	}));
}

/**
 * Cancel a user's own pending invite (frees a quota slot). Only deletes if the
 * user created it AND it hasn't been redeemed. Returns true if a row was removed.
 */
export async function deleteOwnInvite(userId: string, id: string): Promise<boolean> {
	const deleted = await db
		.delete(invite)
		.where(
			and(eq(invite.id, id), eq(invite.createdByUserId, userId), isNull(invite.redeemedByUserId))
		)
		.returning({ id: invite.id });
	return deleted.length > 0;
}

/**
 * Delete any invite by code (admin). Returns true if a row was removed.
 *
 * If the invite was minted to admit a waitlist entry, that entry is reset to
 * `pending` first so it can be re-invited - otherwise the FK would null out its
 * `inviteId` on delete and leave it stuck showing `invited` with no link. Done
 * in one transaction, and the reset must run before the delete (while the link
 * still exists).
 */
export async function deleteInvite(id: string): Promise<boolean> {
	return db.transaction(async (tx) => {
		await tx
			.update(waitlist)
			.set({ status: 'pending', inviteId: null, invitedAt: null })
			.where(eq(waitlist.inviteId, id));
		const deleted = await tx.delete(invite).where(eq(invite.id, id)).returning({ id: invite.id });
		return deleted.length > 0;
	});
}

/**
 * Check whether an invite code is currently redeemable. Returns the code's
 * row if so, null if unknown/already redeemed. Doesn't mutate state.
 */
export async function findRedeemableInvite(code: string) {
	const [row] = await db
		.select()
		.from(invite)
		.where(and(eq(invite.id, code), isNull(invite.redeemedByUserId)))
		.limit(1);
	return row ?? null;
}

/**
 * Atomically mark an invite as redeemed by `userId`. Returns true if the
 * redemption took (i.e. the code was valid and unused at the moment).
 * Used inside the signup transaction so race conditions can't double-spend
 * an invite.
 */
export async function redeemInvite(code: string, userId: string): Promise<boolean> {
	const result = await db
		.update(invite)
		.set({ redeemedByUserId: userId, redeemedAt: new Date() })
		.where(and(eq(invite.id, code), isNull(invite.redeemedByUserId)))
		.returning({ id: invite.id });
	return result.length > 0;
}
