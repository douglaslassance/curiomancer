/**
 * Subscription status checks, admin overrides, and Stripe sync. The local
 * `subscription` table is the source of truth for access (`isSubscriber`) and
 * metrics. Rows land here two ways: admin grants (comps, no Stripe fields) and
 * Stripe webhooks (`syncStripeSubscription`), which mirror a real Stripe
 * subscription into a row.
 */
import { and, desc, eq, isNotNull, sql } from 'drizzle-orm';
import type Stripe from 'stripe';
import { db } from './db';
import { subscription } from './db/schema';
import { getStripe, stripeEnabled } from './stripe';

// Stripe statuses we treat as "has access". `past_due` is included so a failed
// renewal doesn't instantly cut off a paying user while Stripe retries (dunning).
const ACTIVE_STRIPE_STATUSES = new Set<Stripe.Subscription.Status>([
	'active',
	'trialing',
	'past_due'
]);

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

/**
 * Cancels `userId`'s active subscription, if any. For Stripe-backed rows this
 * also cancels the subscription in Stripe so billing stops, never just local
 * access - otherwise an admin revoke would keep charging a card while cutting
 * the user off. Admin comps have no Stripe id and are canceled locally only.
 */
export async function revokeSubscription(userId: string): Promise<void> {
	const rows = await db
		.select({ stripeSubscriptionId: subscription.stripeSubscriptionId })
		.from(subscription)
		.where(and(eq(subscription.userId, userId), eq(subscription.status, 'active')));

	for (const row of rows) {
		if (row.stripeSubscriptionId && stripeEnabled()) {
			try {
				await getStripe().subscriptions.cancel(row.stripeSubscriptionId);
			} catch (err) {
				// Log but still cancel locally: the webhook will reconcile if the
				// Stripe-side cancel actually went through later.
				console.error(`[stripe] failed to cancel ${row.stripeSubscriptionId}:`, err);
			}
		}
	}

	await db
		.update(subscription)
		.set({ status: 'canceled', canceledAt: sql`now()` })
		.where(and(eq(subscription.userId, userId), eq(subscription.status, 'active')));
}

/** The user's most recent Stripe customer id, if they've ever had a paid sub. */
export async function latestCustomerId(userId: string): Promise<string | null> {
	const [row] = await db
		.select({ customerId: subscription.stripeCustomerId })
		.from(subscription)
		.where(and(eq(subscription.userId, userId), isNotNull(subscription.stripeCustomerId)))
		.orderBy(desc(subscription.createdAt))
		.limit(1);
	return row?.customerId ?? null;
}

export type ActiveSubscription = {
	/** Admin comp (no Stripe side) vs a real paid Stripe subscription. */
	isComp: boolean;
	currentPeriodEnd: Date | null;
	cancelAtPeriodEnd: boolean;
	/** Whether the Stripe Customer Portal can be opened (Stripe-backed only). */
	canManage: boolean;
};

/** The user's current active subscription, shaped for the settings display. */
export async function getActiveSubscription(userId: string): Promise<ActiveSubscription | null> {
	const [row] = await db
		.select({
			stripeCustomerId: subscription.stripeCustomerId,
			currentPeriodEnd: subscription.currentPeriodEnd,
			cancelAtPeriodEnd: subscription.cancelAtPeriodEnd
		})
		.from(subscription)
		.where(and(eq(subscription.userId, userId), eq(subscription.status, 'active')))
		.orderBy(desc(subscription.createdAt))
		.limit(1);
	if (!row) return null;
	return {
		isComp: !row.stripeCustomerId,
		currentPeriodEnd: row.currentPeriodEnd,
		cancelAtPeriodEnd: row.cancelAtPeriodEnd,
		canManage: !!row.stripeCustomerId
	};
}

/** Resolve a Stripe customer id to a local user via any existing row. */
async function userIdForCustomer(customerId: string): Promise<string | null> {
	const [row] = await db
		.select({ userId: subscription.userId })
		.from(subscription)
		.where(eq(subscription.stripeCustomerId, customerId))
		.limit(1);
	return row?.userId ?? null;
}

/**
 * Mirror a Stripe subscription into the local table. Idempotent: keyed on the
 * Stripe subscription id, so repeated webhook deliveries converge and admin
 * comps (which have no Stripe id) are never touched. Called from the webhook
 * for customer.subscription.created / updated / deleted.
 */
export async function syncStripeSubscription(sub: Stripe.Subscription): Promise<void> {
	const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
	// Prefer the userId we stamped at checkout; fall back to an existing row for
	// this customer (e.g. a subscription changed outside our checkout flow).
	const userId = sub.metadata?.userId ?? (await userIdForCustomer(customerId));
	if (!userId) {
		console.error(`[stripe] subscription ${sub.id} has no mappable user; skipping sync`);
		return;
	}

	const item = sub.items.data[0];
	// current_period_end lives on the item in current Stripe API versions.
	const periodEnd = item?.current_period_end ?? null;
	const active = ACTIVE_STRIPE_STATUSES.has(sub.status);

	const values = {
		status: active ? ('active' as const) : ('canceled' as const),
		priceCents: item?.price.unit_amount ?? 499,
		currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
		// True once the user schedules cancellation; the sub stays active until
		// currentPeriodEnd, so we surface "cancels on <date>" instead of "renews".
		cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
		canceledAt: active ? null : new Date((sub.canceled_at ?? Math.floor(Date.now() / 1000)) * 1000),
		stripeCustomerId: customerId
	};

	await db
		.insert(subscription)
		.values({
			userId,
			stripeSubscriptionId: sub.id,
			...values
		})
		.onConflictDoUpdate({ target: subscription.stripeSubscriptionId, set: values });
}
