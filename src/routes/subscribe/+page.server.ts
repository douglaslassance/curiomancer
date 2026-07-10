import { error, fail, redirect } from '@sveltejs/kit';
import { and, desc, eq, isNotNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { subscription } from '$lib/server/db/schema';
import { isSubscriber } from '$lib/server/subscriptions';
import { getStripe, stripeEnabled, stripePriceId } from '$lib/server/stripe';
import type { Actions, PageServerLoad } from './$types';

/** The user's most recent Stripe customer id, if they've ever had a paid sub. */
async function latestCustomerId(userId: string): Promise<string | null> {
	const [row] = await db
		.select({ customerId: subscription.stripeCustomerId })
		.from(subscription)
		.where(and(eq(subscription.userId, userId), isNotNull(subscription.stripeCustomerId)))
		.orderBy(desc(subscription.createdAt))
		.limit(1);
	return row?.customerId ?? null;
}

export const load: PageServerLoad = async ({ locals }) => {
	// Only Stripe-backed subs can open the Customer Portal; admin comps can't.
	const canManageBilling = locals.user ? !!(await latestCustomerId(locals.user.id)) : false;
	return { canManageBilling };
};

export const actions: Actions = {
	// Starts Stripe Checkout for the subscription. The local subscription
	// row is created later by the webhook (customer.subscription.created), not
	// here - this only kicks off the hosted payment page.
	checkout: async ({ locals, url }) => {
		if (!locals.user) throw redirect(302, '/sign-in?next=/subscribe');
		if (!stripeEnabled()) return fail(503, { message: 'Billing is not available right now.' });

		// Already subscribed (paid or comped): nothing to buy, send them in.
		if (await isSubscriber(locals.user.id)) throw redirect(303, '/messages');

		// Reuse the Stripe customer from any prior subscription so resubscribing
		// doesn't spawn a duplicate customer in Stripe.
		const priorCustomerId = await latestCustomerId(locals.user.id);

		const stripe = getStripe();
		const session = await stripe.checkout.sessions.create({
			mode: 'subscription',
			line_items: [{ price: stripePriceId(), quantity: 1 }],
			success_url: `${url.origin}/subscribe?checkout=success`,
			cancel_url: `${url.origin}/subscribe?checkout=canceled`,
			client_reference_id: locals.user.id,
			// Mirrored onto the subscription so the webhook can map it back to a
			// user even if the Checkout Session isn't the event we handle.
			subscription_data: { metadata: { userId: locals.user.id } },
			...(priorCustomerId ? { customer: priorCustomerId } : { customer_email: locals.user.email })
		});

		if (!session.url) throw error(500, 'Could not start checkout.');
		throw redirect(303, session.url);
	},

	// Opens the Stripe Customer Portal so the user can update payment methods,
	// see invoices, or cancel. Only available to Stripe-backed subscribers.
	portal: async ({ locals, url }) => {
		if (!locals.user) throw redirect(302, '/sign-in?next=/subscribe');
		if (!stripeEnabled()) return fail(503, { message: 'Billing is not available right now.' });

		const customerId = await latestCustomerId(locals.user.id);
		if (!customerId) return fail(400, { message: 'No billing account to manage.' });

		const session = await getStripe().billingPortal.sessions.create({
			customer: customerId,
			return_url: `${url.origin}/subscribe`
		});
		throw redirect(303, session.url);
	}
};
