/**
 * Invite management — creation, redemption, listing.
 *
 * Each user gets a fixed number of invites at signup. Inviting somebody
 * decrements the inviter's remaining count by linking the invite row to
 * the new user via `redeemedByUserId`.
 */
import { and, eq, isNull, sql } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { db } from './db';
import { invite } from './db/schema';

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

/** Create `count` fresh invites assigned to `userId`. */
export async function createInvitesFor(userId: string, count: number): Promise<void> {
	const rows = Array.from({ length: count }, () => ({
		id: generateInviteCode(),
		createdByUserId: userId
	}));
	await db.insert(invite).values(rows);
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
		WHERE i.created_by_user_id = ${userId}
		ORDER BY i.created_at ASC
	`);
	return rows.map((r) => ({
		id: r.id,
		createdAt: r.created_at,
		redeemedByUserId: r.redeemed_by_user_id,
		redeemedAt: r.redeemed_at,
		redeemedByName: r.redeemed_by_name
	}));
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
