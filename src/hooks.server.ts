import { redirect, type Handle, type HandleServerError } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import * as Sentry from '@sentry/sveltekit';
import { building } from '$app/environment';
import { PUBLIC_POSTHOG_PROJECT_TOKEN, PUBLIC_POSTHOG_HOST } from '$env/static/public';
import { auth } from '$lib/server/auth';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { startMetricsCron } from '$lib/server/cron';
import { touchUserActivity } from '$lib/server/metrics';
import { resolvePostHogHosts } from '$lib/posthog';

// Pages anyone can reach signed out: the marketing/legal pages and the whole
// auth flow. Everything else is account-only and bounces to /sign-in. API
// endpoints are not listed here - they guard themselves and must answer with
// 401, not an HTML redirect.
const PUBLIC_PATHS = new Set([
	'/',
	'/terms',
	'/privacy',
	'/contact',
	'/sign-in',
	'/sign-up',
	'/forgot-password',
	'/reset-password',
	'/setup'
]);

// Kick off the daily metrics snapshot cron once, when the server boots.
// Skipped during the build/prerender pass (no server, no DB work wanted).
if (!building) startMetricsCron();

// In-process throttle for the last-seen heartbeat: at most one DB write per
// user every 5 minutes, so a burst of requests doesn't hammer user_activity.
const HEARTBEAT_MS = 5 * 60 * 1000;
const lastBeat = new Map<string, number>();

function heartbeat(userId: string): void {
	const now = Date.now();
	const prev = lastBeat.get(userId);
	if (prev && now - prev < HEARTBEAT_MS) return;
	lastBeat.set(userId, now);
	// Fire-and-forget: activity tracking must never delay or fail a request.
	void touchUserActivity(userId).catch((err) => console.error('[metrics] heartbeat failed:', err));
}

const handleBetterAuth: Handle = async ({ event, resolve }) => {
	const { pathname } = event.url;

	// Opt-in: only forwards to a PostHog server when a project token is
	// configured for this deployment.
	if (PUBLIC_POSTHOG_PROJECT_TOKEN && pathname.startsWith('/ingest')) {
		const { ingest, assets } = resolvePostHogHosts(PUBLIC_POSTHOG_HOST);
		const useAssetHost =
			pathname.startsWith('/ingest/static/') || pathname.startsWith('/ingest/array/');
		const hostname = useAssetHost ? assets : ingest;

		const url = new URL(event.request.url);
		url.protocol = 'https:';
		url.hostname = hostname;
		url.port = '443';
		url.pathname = pathname.replace(/^\/ingest/, '');

		const headers = new Headers(event.request.headers);
		headers.set('host', hostname);
		headers.set('accept-encoding', '');

		const clientIp = event.request.headers.get('x-forwarded-for') || event.getClientAddress();
		if (clientIp) headers.set('x-forwarded-for', clientIp);

		return fetch(url.toString(), {
			method: event.request.method,
			headers,
			body: event.request.body,
			// @ts-expect-error - duplex is required for streaming request bodies
			duplex: 'half'
		});
	}

	const session = await auth.api.getSession({ headers: event.request.headers });

	if (session) {
		event.locals.session = session.session;
		event.locals.user = session.user;
		heartbeat(session.user.id);
	}

	// Central route guard: unless the request is for a public page, an API
	// endpoint (self-guarded), or a build asset, a signed-out visitor is sent
	// to sign-in. Strip the `/__data.json` suffix so client-side navigations
	// are caught too.
	const requestedPath = pathname.replace(/\/__data\.json$/, '') || '/';
	const isExempt =
		PUBLIC_PATHS.has(requestedPath) ||
		pathname.startsWith('/api/') ||
		pathname.startsWith('/_app/') ||
		pathname.startsWith('/.well-known/') ||
		pathname === '/sign-out' ||
		pathname === '/favicon.svg';
	if (!isExempt && !event.locals.user) {
		throw redirect(302, `/sign-in?next=${encodeURIComponent(requestedPath)}`);
	}

	return svelteKitHandler({ event, resolve, auth, building });
};

const myErrorHandler: HandleServerError = async ({ error, status, message }) => {
	console.error(error);
	return { message, status };
};

export const handleError: HandleServerError = Sentry.handleErrorWithSentry(myErrorHandler);

export const handle: Handle = sequence(Sentry.sentryHandle(), handleBetterAuth);
