import { error, json } from '@sveltejs/kit';
import { createInvitedUser } from '$lib/server/signup';
import { rateLimit } from '$lib/server/rate-limit';
import type { RequestHandler } from './$types';

// Sign-up is invite-gated (a valid, unredeemed code is required), so abuse is
// already bounded - but this is an unauthenticated account-creation surface, so
// cap it per IP as defense in depth.
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_IP = 20;

/**
 * POST /api/v1/auth/signup
 *
 * Native twin of the web /sign-up form action. Creates an invite-gated account
 * through the exact same `createInvitedUser` path the web uses, so invite
 * binding and rollback behave identically. `requireEmailVerification` means no
 * token is minted here: the response tells the client to show a "check your
 * email" state, and the user signs in via POST /api/v1/auth/token once verified.
 *
 *   body: { name, email, password, invite, city?, latitude?, longitude? }
 *   returns: { verifyEmailSent: true, email }
 */
export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	const limit = rateLimit(`signup:ip:${getClientAddress()}`, MAX_PER_IP, WINDOW_MS);
	if (!limit.ok) throw error(429, `Too many attempts. Try again in ${limit.retryAfterSec}s.`);

	const body = (await request.json().catch(() => null)) as {
		name?: unknown;
		email?: unknown;
		password?: unknown;
		invite?: unknown;
		city?: unknown;
		latitude?: unknown;
		longitude?: unknown;
	} | null;
	if (!body) throw error(400, 'Expected a JSON body.');

	const str = (v: unknown) => (typeof v === 'string' ? v : '');
	// Coordinates may arrive as JSON numbers from the device; stringify for the
	// shared helper, which parses them back (it also accepts a typed city).
	const numStr = (v: unknown) =>
		typeof v === 'number' && isFinite(v) ? String(v) : typeof v === 'string' ? v : '';

	const result = await createInvitedUser({
		name: str(body.name),
		email: str(body.email),
		password: str(body.password),
		code: str(body.invite).trim() || null,
		city: str(body.city).trim(),
		latitude: numStr(body.latitude),
		longitude: numStr(body.longitude)
	});

	if (!result.ok) throw error(result.status, result.message);

	return json({ verifyEmailSent: true, email: result.email });
};
