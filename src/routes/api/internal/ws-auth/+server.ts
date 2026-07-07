import { error, json } from '@sveltejs/kit';
import { authenticateToken } from '$lib/server/api-tokens';
import { isParticipant } from '$lib/server/messages';
import { isSubscriber } from '$lib/server/subscriptions';
import type { RequestHandler } from './$types';

/**
 * GET /api/internal/ws-auth?conversationId=...
 *
 * Not a public API - called only by server.ts's raw WS upgrade handler, via
 * loopback, forwarding the original connection's cookie/authorization
 * headers. Exists so the WS upgrade path (which runs outside SvelteKit's
 * pipeline entirely, see ws/upgrade.ts) can reuse the exact same auth
 * resolution as every other route - bearer token first (locals.user isn't
 * populated for those), falling back to the cookie session hooks.server.ts
 * already resolved into `locals.user`.
 */
export const GET: RequestHandler = async ({ request, url, locals }) => {
	const conversationId = url.searchParams.get('conversationId');
	if (!conversationId) throw error(400, 'conversationId required.');

	const bearerUserId = await authenticateToken(request.headers.get('authorization'));
	const userId = bearerUserId ?? locals.user?.id ?? null;
	if (!userId) throw error(401, 'Sign in first.');
	if (!(await isSubscriber(userId))) throw error(403, 'Subscription required.');

	if (!(await isParticipant(conversationId, userId))) {
		throw error(403, 'Not a participant in this conversation.');
	}

	return json({ userId });
};
