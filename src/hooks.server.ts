import type { Handle, HandleServerError } from '@sveltejs/kit';
import { building } from '$app/environment';
import { auth } from '$lib/server/auth';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { startMetricsCron } from '$lib/server/cron';
import { touchUserActivity } from '$lib/server/metrics';
import { getPostHogClient } from '$lib/server/posthog';

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

	if (pathname.startsWith('/ingest')) {
		const useAssetHost =
			pathname.startsWith('/ingest/static/') || pathname.startsWith('/ingest/array/');
		const hostname = useAssetHost ? 'us-assets.i.posthog.com' : 'us.i.posthog.com';

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

	return svelteKitHandler({ event, resolve, auth, building });
};

export const handleError: HandleServerError = async ({ error, status, message }) => {
	const posthog = getPostHogClient();
	posthog.capture({
		distinctId: 'server',
		event: 'server_error',
		properties: {
			error: error instanceof Error ? error.message : String(error),
			status,
			message
		}
	});
	return { message, status };
};

export const handle: Handle = handleBetterAuth;
