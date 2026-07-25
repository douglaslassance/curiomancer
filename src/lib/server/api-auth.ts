import { error } from '@sveltejs/kit';
import { authenticateToken } from './api-tokens';
import { rateLimit } from './rate-limit';

// Per-user throttle for the authenticated v1 surface. Keyed on the resolved
// user id, not IP, so it survives carrier NAT (many phones behind one address)
// and so a leaked token can't be used to hammer the API harder than its owner
// could. A generous ceiling: this is an abuse backstop, not metering. A native
// client refreshing several endpoints on foreground, or paging a list, stays
// well under it; a script in a tight loop does not. In-process like the rest of
// the limiter (see rate-limit.ts), so with multiple replicas the effective cap
// is per-replica, which is fine for this purpose.
const WINDOW_MS = 60 * 1000;
const MAX_PER_USER = 300;

/**
 * Resolve a request's `Authorization: Bearer <token>` header to a user id, or
 * throw a 401. The shared guard for every /api/v1 route: unlike the cookie
 * sessions the web pages use, the native and third-party clients authenticate
 * with a personal access token (see api-tokens.ts).
 *
 * Also applies the per-user rate limit, so every route funneling through here
 * is covered by construction. Anything authenticating tokens outside this
 * helper is on its own and must not exist (see the grep in the tests/docs).
 */
export async function requireApiUser(request: Request): Promise<string> {
	const userId = await authenticateToken(request.headers.get('authorization'));
	if (!userId) {
		throw error(401, 'Provide a valid token: Authorization: Bearer <token>');
	}

	const limit = rateLimit(`v1:user:${userId}`, MAX_PER_USER, WINDOW_MS);
	if (!limit.ok) {
		throw error(429, `Rate limit exceeded. Try again in ${limit.retryAfterSec}s.`);
	}

	return userId;
}
