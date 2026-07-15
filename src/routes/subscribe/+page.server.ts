import { error, fail, redirect } from '@sveltejs/kit';
import { isSubscriber, latestCustomerId } from '$lib/server/subscriptions';
import { getStripe, stripeEnabled, stripePriceId } from '$lib/server/stripe';
import type { Actions } from './$types';

export const actions: Actions = {
	// Starts Stripe Checkout for the subscription. The local subscription
	// row is created later by the webhook (customer.subscription.created), not
	// here - this only kicks off the hosted payment page. Managing an existing
	// subscription lives in Settings, not here.
	//
	// managed_payments makes Stripe the merchant of record: Stripe (not us)
	// calculates, collects, and remits sales tax/VAT/GST worldwide and issues
	// the invoices, so we carry no cross-border tax liability. The product must
	// carry a Managed-Payments-eligible tax code and the feature must be active
	// in the Dashboard (Settings > Managed Payments) for this to take effect.
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
			// Merchant of record: Stripe handles all indirect tax. Keep the rest of
			// this call free of the params Managed Payments disallows (automatic_tax,
			// tax_id_collection, customer_update, custom statement descriptors).
			managed_payments: { enabled: true },
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
	}
};
