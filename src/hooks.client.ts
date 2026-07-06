import posthog from 'posthog-js';
import * as Sentry from '@sentry/sveltekit';
import { dev } from '$app/environment';
import { PUBLIC_POSTHOG_PROJECT_TOKEN, PUBLIC_SENTRY_DSN } from '$env/static/public';
import type { HandleClientError } from '@sveltejs/kit';

// Opt-in: only reports when a DSN is configured for this deployment.
if (PUBLIC_SENTRY_DSN) {
	Sentry.init({ dsn: PUBLIC_SENTRY_DSN, environment: dev ? 'development' : 'production' });
}

export async function init() {
	// Opt-in: only reports when a project token is configured for this deployment.
	if (!PUBLIC_POSTHOG_PROJECT_TOKEN) return;
	posthog.init(PUBLIC_POSTHOG_PROJECT_TOKEN, {
		api_host: '/ingest',
		ui_host: 'https://us.posthog.com',
		defaults: '2026-01-30',
		capture_exceptions: false
	});
}

const myErrorHandler: HandleClientError = async ({ error, status, message }) => {
	return { message, status };
};

export const handleError: HandleClientError = Sentry.handleErrorWithSentry(myErrorHandler);
