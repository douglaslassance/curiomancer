import { error, json } from '@sveltejs/kit';
import type Stripe from 'stripe';
import { getStripe, stripeEnabled, stripeWebhookSecret } from '$lib/server/stripe';
import { syncStripeSubscription } from '$lib/server/subscriptions';
import type { RequestHandler } from './$types';

/**
 * Stripe webhook. Verifies the signature against the raw body, then mirrors
 * subscription lifecycle events into the local `subscription` table. This is
 * the only path that makes a Stripe payment grant access, so it must stay
 * signature-verified and idempotent (syncStripeSubscription handles the latter).
 *
 * Lives under /api/ so the auth guard treats it as self-guarding (no redirect),
 * and Stripe sends application/json so SvelteKit's form-CSRF check doesn't apply.
 */
export const POST: RequestHandler = async ({ request }) => {
	if (!stripeEnabled()) throw error(503, 'Billing is not configured.');

	const signature = request.headers.get('stripe-signature');
	if (!signature) throw error(400, 'Missing Stripe signature.');

	// Raw body is required for signature verification - do not parse first.
	const payload = await request.text();

	let event: Stripe.Event;
	try {
		event = await getStripe().webhooks.constructEventAsync(
			payload,
			signature,
			stripeWebhookSecret()
		);
	} catch (err) {
		console.error('[stripe] webhook signature verification failed:', err);
		throw error(400, 'Invalid signature.');
	}

	switch (event.type) {
		case 'customer.subscription.created':
		case 'customer.subscription.updated':
		case 'customer.subscription.deleted':
			await syncStripeSubscription(event.data.object);
			break;
		default:
			// Other event types are intentionally ignored.
			break;
	}

	return json({ received: true });
};
