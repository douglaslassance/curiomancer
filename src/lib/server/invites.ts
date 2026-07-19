/**
 * Invite management - creation, redemption, listing.
 *
 * Each user gets a fixed number of invites at signup. Inviting somebody
 * decrements the inviter's remaining count by linking the invite row to
 * the new user via `redeemedByUserId`.
 */
import { and, eq, isNull, sql } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { db } from './db';
import { invite, waitlist } from './db/schema';

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
 * Create `count` fresh invites for `userId` - their personal signup allotment.
 * The system mints these automatically, so there's no creator (null); the user
 * only owns them (shows in their Settings).
 */
export async function createInvitesFor(userId: string, count: number): Promise<void> {
	const rows = Array.from({ length: count }, () => ({
		id: generateInviteCode(),
		createdByUserId: null,
		ownerId: userId
	}));
	await db.insert(invite).values(rows);
}

/**
 * Grant a brand-new user their signup invites, exactly once. Idempotent: if
 * the user already owns any invite (e.g. an auth `create.after` hook that fired
 * twice for the same account), this does nothing - so a double-fired signup
 * can't hand out a double batch of invites.
 */
export async function grantSignupInvites(userId: string, count: number): Promise<void> {
	// Check by owner, not creator: signup invites have a null creator now, but
	// the user always owns them. (At signup time no one else has gifted them an
	// invite yet, so owner == userId uniquely identifies their allotment.)
	const [existing] = await db
		.select({ id: invite.id })
		.from(invite)
		.where(eq(invite.ownerId, userId))
		.limit(1);
	if (existing) return;
	await createInvitesFor(userId, count);
}

/**
 * Mint one invite and return its code. `createdByUserId` is the acting user
 * (audit); `ownerId` is who it belongs to, defaulting to null = unowned/platform
 * invite (batch admin invites, waitlist admits) so it doesn't clutter anyone's
 * Settings. Pass an ownerId to gift it to a specific user.
 */
export async function createInviteReturningCode(
	createdByUserId: string,
	ownerId: string | null = null
): Promise<string> {
	const code = generateInviteCode();
	await db.insert(invite).values({ id: code, createdByUserId, ownerId });
	return code;
}

export type InviteWithRedeemer = {
	id: string;
	createdAt: Date;
	redeemedByUserId: string | null;
	redeemedAt: Date | null;
	redeemedByName: string | null;
};

/** All invites owned by a user, with the redeemer's display name if used. */
export async function getInvitesFor(userId: string): Promise<InviteWithRedeemer[]> {
	const rows = await db.execute<{
		id: string;
		created_at: Date;
		redeemed_by_user_id: string | null;
		redeemed_at: Date | null;
		redeemed_by_name: string | null;
	}>(sql`
		SELECT
			i.id,
			i.created_at,
			i.redeemed_by_user_id,
			i.redeemed_at,
			u.name AS redeemed_by_name
		FROM "invite" i
		LEFT JOIN "user" u ON u.id = i.redeemed_by_user_id
		WHERE i.owner_id = ${userId}
		ORDER BY i.created_at ASC
	`);
	return rows.map((r) => ({
		id: r.id,
		createdAt: new Date(r.created_at),
		redeemedByUserId: r.redeemed_by_user_id,
		redeemedAt: r.redeemed_at ? new Date(r.redeemed_at) : null,
		redeemedByName: r.redeemed_by_name
	}));
}

export type InviteLedgerRow = {
	id: string;
	createdAt: Date;
	// Who the invite belongs to (its `ownerId`). Null = unowned/platform invite.
	ownerName: string | null;
	// Who minted the row (its `createdByUserId`) - audit, always set.
	creatorName: string | null;
	// Intended recipient, only known for invites minted by admitting a waitlist
	// entry (that entry's email). Null for directly-created and signup invites -
	// there's no recipient field on the invite itself.
	intendedForEmail: string | null;
	redeemedByUserId: string | null;
	redeemedAt: Date | null;
	redeemedByName: string | null;
};

/** Every invite in the system, newest first, with owner, creator and redeemer. */
export async function getAllInvites(): Promise<InviteLedgerRow[]> {
	const rows = await db.execute<{
		id: string;
		created_at: Date;
		owner_name: string | null;
		creator_name: string | null;
		intended_for_email: string | null;
		redeemed_by_user_id: string | null;
		redeemed_at: Date | null;
		redeemed_by_name: string | null;
	}>(sql`
		SELECT
			i.id,
			i.created_at,
			o.name AS owner_name,
			c.name AS creator_name,
			-- Subquery, not a JOIN: if more than one waitlist row points at this
			-- invite, a JOIN would fan out into duplicate ledger rows (showing the
			-- recipient email twice). This keeps it one row per invite.
			(
				SELECT w.email FROM "waitlist" w
				WHERE w.invite_id = i.id
				ORDER BY w.created_at ASC
				LIMIT 1
			) AS intended_for_email,
			i.redeemed_by_user_id,
			i.redeemed_at,
			r.name AS redeemed_by_name
		FROM "invite" i
		LEFT JOIN "user" o ON o.id = i.owner_id
		LEFT JOIN "user" c ON c.id = i.created_by_user_id
		LEFT JOIN "user" r ON r.id = i.redeemed_by_user_id
		ORDER BY i.created_at DESC
	`);
	return rows.map((r) => ({
		id: r.id,
		createdAt: new Date(r.created_at),
		ownerName: r.owner_name,
		creatorName: r.creator_name,
		intendedForEmail: r.intended_for_email,
		redeemedByUserId: r.redeemed_by_user_id,
		redeemedAt: r.redeemed_at ? new Date(r.redeemed_at) : null,
		redeemedByName: r.redeemed_by_name
	}));
}

/** Clear one invite's owner (-> null / unowned). Returns true if it existed. */
export async function clearInviteOwner(id: string): Promise<boolean> {
	const rows = await db
		.update(invite)
		.set({ ownerId: null })
		.where(eq(invite.id, id))
		.returning({ id: invite.id });
	return rows.length > 0;
}

/** Clear one invite's creator (-> null / system). Returns true if it existed. */
export async function clearInviteCreator(id: string): Promise<boolean> {
	const rows = await db
		.update(invite)
		.set({ createdByUserId: null })
		.where(eq(invite.id, id))
		.returning({ id: invite.id });
	return rows.length > 0;
}

/**
 * Delete an invite by code. Returns true if a row was removed.
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
