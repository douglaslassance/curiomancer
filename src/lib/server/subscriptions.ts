/**
 * Subscription status checks and admin overrides. Billing isn't wired up
 * yet (see `subscription` in db/schema.ts), so `grantSubscription` /
 * `revokeSubscription` are the only way rows land here for now - used by
 * the admin panel to hand out or pull subscriber access for testing.
 */
import { and, eq, sql } from 'drizzle-orm';
import { db } from './db';
import { subscription } from './db/schema';

/** Whether `userId` currently has an active subscription. */
export async function isSubscriber(userId: string): Promise<boolean> {
	const [row] = await db
		.select({ id: subscription.id })
		.from(subscription)
		.where(and(eq(subscription.userId, userId), eq(subscription.status, 'active')))
		.limit(1);
	return !!row;
}

/** Grants `userId` an active subscription, unless they already have one. */
export async function grantSubscription(userId: string): Promise<void> {
	if (await isSubscriber(userId)) return;
	await db.insert(subscription).values({ userId });
}

/** Cancels `userId`'s active subscription, if any. */
export async function revokeSubscription(userId: string): Promise<void> {
	await db
		.update(subscription)
		.set({ status: 'canceled', canceledAt: sql`now()` })
		.where(and(eq(subscription.userId, userId), eq(subscription.status, 'active')));
}
