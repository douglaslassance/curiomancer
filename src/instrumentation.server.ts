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
		enableLogs: true,
		// Default (false), but pinned explicitly so request headers/cookies and
		// user data are never attached to events.
		sendDefaultPii: false,
		// Strip credential-bearing bits before anything leaves the process: the
		// Cookie/Authorization headers, and the auth query strings (?token=,
		// ?next=) that can ride along on request URLs.
		beforeSend(event) {
			const headers = event.request?.headers;
			if (headers) {
				delete headers.cookie;
				delete headers.Cookie;
				delete headers.authorization;
				delete headers.Authorization;
			}
			if (event.request?.query_string) delete event.request.query_string;
			return event;
		}
	});
}
