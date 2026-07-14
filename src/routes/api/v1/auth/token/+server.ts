import { error, json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { APIError } from 'better-auth/api';
import { auth } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { user } from '$lib/server/db/schema';
import { createApiToken } from '$lib/server/api-tokens';
import { rateLimit } from '$lib/server/rate-limit';
import type { RequestHandler } from './$types';

// Password guessing is the threat here: cap attempts per IP, and tighter still
// per IP+email so spraying one account is throttled even behind a shared NAT.
const WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_IP = 30;
const MAX_PER_IP_EMAIL = 8;

/**
 * POST /api/v1/auth/token
 *
 * Exchange email + password for a personal access token, so native and
 * third-party clients get a bearer credential without the cookie-session
 * dance the web pages use. Verifies the password through the exact same
 * better-auth call the web sign-in action makes, then mints a token.
 *
 *   body: { email, password, deviceName? }
 *   returns: { token: "crmc_…", user: { id, name } }
 *
 * The plaintext token is shown only in this response; store it on device.
 */
export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	const body = (await request.json().catch(() => null)) as {
		email?: unknown;
		password?: unknown;
		deviceName?: unknown;
	} | null;

	const email = typeof body?.email === 'string' ? body.email.trim() : '';
	const password = typeof body?.password === 'string' ? body.password : '';
	const deviceName =
		typeof body?.deviceName === 'string' && body.deviceName.trim()
			? body.deviceName.trim()
			: 'API token';

	if (!email || !password) {
		throw error(400, 'email and password are required.');
	}

	const ip = getClientAddress();
	const byIp = rateLimit(`token:ip:${ip}`, MAX_PER_IP, WINDOW_MS);
	const byEmail = rateLimit(`token:ip-email:${ip}:${email.toLowerCase()}`, MAX_PER_IP_EMAIL, WINDOW_MS);
	if (!byIp.ok || !byEmail.ok) {
		throw error(429, `Too many attempts. Try again in ${byIp.retryAfterSec || byEmail.retryAfterSec}s.`);
	}

	let result;
	try {
		result = await auth.api.signInEmail({ body: { email, password } });
	} catch (err) {
		if (err instanceof APIError) throw error(401, 'Invalid email or password.');
		console.error('Token sign-in failed:', err);
		throw error(500, 'Unexpected error. Try again.');
	}

	// signInEmail returns the user on success. Fall back to an email lookup so a
	// future change to better-auth's return shape can't silently 401 valid creds.
	let account = result?.user ? { id: result.user.id, name: result.user.name } : null;
	if (!account) {
		const [row] = await db
			.select({ id: user.id, name: user.name })
			.from(user)
			.where(eq(user.email, email))
			.limit(1);
		account = row ?? null;
	}
	if (!account) throw error(401, 'Invalid email or password.');

	const token = await createApiToken(account.id, deviceName);
	return json({ token, user: account });
};
