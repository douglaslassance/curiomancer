import type { Handle } from '@sveltejs/kit';
import { building } from '$app/environment';
import { auth } from '$lib/server/auth';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { startMetricsCron } from '$lib/server/cron';
import { touchUserActivity } from '$lib/server/metrics';

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
	const session = await auth.api.getSession({ headers: event.request.headers });

	if (session) {
		event.locals.session = session.session;
		event.locals.user = session.user;
		heartbeat(session.user.id);
	}

	return svelteKitHandler({ event, resolve, auth, building });
};

export const handle: Handle = handleBetterAuth;
