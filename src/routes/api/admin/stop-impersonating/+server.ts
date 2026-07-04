import { error, json } from '@sveltejs/kit';
import { auth } from '$lib/server/auth';
import type { RequestHandler } from './$types';

/**
 * POST /api/admin/stop-impersonating
 *
 * Ends the current impersonation session and restores the original admin's
 * session. Triggerable from anywhere (the "stop impersonating" banner in the
 * root layout), unlike the impersonate action itself which lives on
 * /admin/users since that's the only place you'd start one.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.session?.impersonatedBy) throw error(400, 'Not impersonating anyone.');
	await auth.api.stopImpersonating({ headers: request.headers });
	return json({ stopped: true });
};
