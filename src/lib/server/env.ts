import { building } from '$app/environment';
import { env } from '$env/dynamic/private';

/**
 * Fail fast at boot when a required secret is missing, instead of surfacing a
 * confusing error deep in an auth or DB code path on the first request.
 *
 * Only the vars with no graceful fallback are enforced here. MapKit, email
 * (Cloudflare), R2 storage, Stripe, PostHog and Sentry are all opt-in with
 * documented fallbacks (see .env.example), so they must not fail boot.
 */
const REQUIRED = ['DATABASE_URL', 'ORIGIN', 'BETTER_AUTH_SECRET'] as const;

export function assertRequiredEnv(): void {
	// Skipped during the build/prerender pass, which runs with placeholder
	// values (see the Dockerfile builder stage).
	if (building) return;

	const missing = REQUIRED.filter((name) => !env[name]);
	if (missing.length > 0) {
		throw new Error(
			`Missing required environment variable(s): ${missing.join(', ')}. ` +
				'Set them before starting the server (see .env.example).'
		);
	}
}
