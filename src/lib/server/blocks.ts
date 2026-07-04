/**
 * Block-graph helpers. Blocking someone makes each of you disappear from
 * the other's world - profile pages 404, you drop out of each other's
 * nearby/twins/recommendation results (see nearby.ts and matching.ts) - even
 * though only one side created the row.
 */
import { and, eq, or } from 'drizzle-orm';
import { db } from './db';
import { block, user } from './db/schema';

/** True if either user has blocked the other. Use this to gate visibility. */
export async function isBlocked(userIdA: string, userIdB: string): Promise<boolean> {
	const rows = await db
		.select({ blockerId: block.blockerId })
		.from(block)
		.where(
			or(
				and(eq(block.blockerId, userIdA), eq(block.blockedId, userIdB)),
				and(eq(block.blockerId, userIdB), eq(block.blockedId, userIdA))
			)
		)
		.limit(1);
	return rows.length > 0;
}

export async function blockUser(blockerId: string, blockedId: string): Promise<void> {
	if (blockerId === blockedId) throw new Error('You cannot block yourself.');
	await db.insert(block).values({ blockerId, blockedId }).onConflictDoNothing();
}

export async function unblockUser(blockerId: string, blockedId: string): Promise<void> {
	await db
		.delete(block)
		.where(and(eq(block.blockerId, blockerId), eq(block.blockedId, blockedId)));
}

export type BlockedUser = { id: string; name: string; image: string | null };

/** Everyone `blockerId` has blocked, for the Settings management list. */
export async function listBlockedUsers(blockerId: string): Promise<BlockedUser[]> {
	return db
		.select({ id: user.id, name: user.name, image: user.image })
		.from(block)
		.innerJoin(user, eq(user.id, block.blockedId))
		.where(eq(block.blockerId, blockerId))
		.orderBy(user.name);
}
