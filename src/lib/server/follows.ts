/**
 * Follow-graph helpers. Following someone treats them as a trusted taste
 * source: their liked places are boosted into the follower's dashboard
 * recommendations via `getRecommendedPlaces` in matching.ts.
 */
import { and, eq } from 'drizzle-orm';
import { db } from './db';
import { follow } from './db/schema';

export async function isFollowing(followerId: string, followedId: string): Promise<boolean> {
	const rows = await db
		.select({ followedId: follow.followedId })
		.from(follow)
		.where(and(eq(follow.followerId, followerId), eq(follow.followedId, followedId)))
		.limit(1);
	return rows.length > 0;
}

export async function followUser(followerId: string, followedId: string): Promise<void> {
	if (followerId === followedId) throw new Error('You cannot follow yourself.');
	await db.insert(follow).values({ followerId, followedId }).onConflictDoNothing();
}

export async function unfollowUser(followerId: string, followedId: string): Promise<void> {
	await db
		.delete(follow)
		.where(and(eq(follow.followerId, followerId), eq(follow.followedId, followedId)));
}
