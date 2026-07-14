/**
 * Opt-in Stripe client. Billing is only active when STRIPE_SECRET_KEY is set,
 * so local/CI environments without billing configured still boot. Secrets are
 * read from $env/dynamic/private (runtime), never baked in at build time.
 *
 * The local `subscription` table stays the source of truth for access
 * (`isSubscriber`) and metrics; Stripe syncs into it via the webhook. Admin
 * grants remain comps with no Stripe side.
 */
import Stripe from 'stripe';
import { env } from '$env/dynamic/private';

let client: Stripe | null = null;

/** Whether billing is configured for this deployment. */
export function stripeEnabled(): boolean {
	return !!env.STRIPE_SECRET_KEY;
}

/**
 * The shared Stripe client. Throws if billing isn't configured, so callers on
 * the payment path fail loudly instead of silently doing nothing.
 */
export function getStripe(): Stripe {
	if (!env.STRIPE_SECRET_KEY) {
		throw new Error('STRIPE_SECRET_KEY is not set; billing is disabled.');
	}
	if (!client) {
		// Pin the API version so a Stripe-side default rollout can't change event
		// or response shapes under us. Matches the version bundled with this SDK
		// (stripe@22); bump it deliberately alongside an SDK upgrade.
		client = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: '2026-06-24.dahlia' });
	}
	return client;
}

/** The recurring Price id customers subscribe to. */
export function stripePriceId(): string {
	if (!env.STRIPE_PRICE_ID) {
		throw new Error('STRIPE_PRICE_ID is not set; billing is disabled.');
	}
	return env.STRIPE_PRICE_ID;
}

/** The webhook signing secret used to verify inbound Stripe events. */
export function stripeWebhookSecret(): string {
	if (!env.STRIPE_WEBHOOK_SECRET) {
		throw new Error('STRIPE_WEBHOOK_SECRET is not set; billing is disabled.');
	}
	return env.STRIPE_WEBHOOK_SECRET;
}
