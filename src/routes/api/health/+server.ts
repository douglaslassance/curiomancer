import { json } from '@sveltejs/kit';
import { sql } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { db } from '$lib/server/db';
import type { RequestHandler } from './$types';

/**
 * GET /api/health
 *
 * Liveness/readiness probe, and the only way to tell from outside which build
 * production is actually running. `/api/health` is a convention rather than a
 * standard; the `status: pass|fail` + `checks` shape follows the (expired)
 * `draft-inadarei-api-health-check` vocabulary.
 *
 * Returns 503 when a dependency is down, so a load balancer or uptime monitor
 * can act on the status code alone without parsing the body.
 *
 * Deliberately unauthenticated and deliberately thin: no counts, no config, no
 * env values beyond the commit. It has to be reachable when the app is sick,
 * which is exactly when leaking detail is least welcome.
 */

/** Process start, not module import, is close enough: this module loads on boot. */
const startedAt = Date.now();

export const GET: RequestHandler = async ({ setHeaders }) => {
	let database: 'ok' | 'down' = 'ok';
	try {
		await db.execute(sql`select 1`);
	} catch (err) {
		console.error('Health check database probe failed:', err);
		database = 'down';
	}

	const healthy = database === 'ok';

	// Never cache: a cached health check is worse than none, since it reports
	// the state of whichever instance answered first, for as long as it is held.
	setHeaders({ 'cache-control': 'no-store' });

	return json(
		{
			status: healthy ? 'pass' : 'fail',
			commit: env.SOURCE_COMMIT || 'unknown',
			uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
			checks: { database }
		},
		{ status: healthy ? 200 : 503 }
	);
};
