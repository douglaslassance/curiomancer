import * as Sentry from '@sentry/sveltekit';
import { dev } from '$app/environment';
import { PUBLIC_SENTRY_DSN } from '$env/static/public';

// Opt-in: only reports when a DSN is configured for this deployment.
if (PUBLIC_SENTRY_DSN) {
	Sentry.init({
		dsn: PUBLIC_SENTRY_DSN,
		environment: dev ? 'development' : 'production',
		// Sample 25% of requests for tracing. Errors are captured 100%
		// regardless (separate quota); this only governs performance spans,
		// so it protects the free 10k-span/month allotment without thinning
		// error visibility.
		tracesSampleRate: 0.25,
		enableLogs: true
	});
}
