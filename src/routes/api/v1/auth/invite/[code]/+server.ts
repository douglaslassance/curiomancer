import { eq } from 'drizzle-orm';
import { error, json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { user } from '$lib/server/db/schema';
import { findRedeemableInvite } from '$lib/server/invites';
import { rateLimit } from '$lib/server/rate-limit';
import type { RequestHandler } from './$types';

// Unauthenticated enumeration surface (no session/token yet at sign-up time), so
// cap lookups per IP. Invite ids are effectively unguessable, but this stops a
// brute-force scan from being cheap.
const WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_IP = 60;

/**
 * GET /api/v1/auth/invite/:code
 *
 * Resolve an invite code so a native client can render the sign-up form the way
 * the web /sign-up page does: show who's inviting you and, when the invite is
 * bound to an address, pre-fill and lock the email field. No auth required -
 * this runs before an account exists.
 *
 *   returns: { state: 'valid' | 'invalid', inviterName: string | null, invitedEmail: string | null }
 */
export const GET: RequestHandler = async ({ params, getClientAddress }) => {
	const limit = rateLimit(`invite:ip:${getClientAddress()}`, MAX_PER_IP, WINDOW_MS);
	if (!limit.ok) throw error(429, `Too many attempts. Try again in ${limit.retryAfterSec}s.`);

	const code = params.code?.trim() ?? '';
	if (!code) throw error(400, 'Missing invite code.');

	const row = await findRedeemableInvite(code);
	if (!row) {
		return json({ state: 'invalid', inviterName: null, invitedEmail: null });
	}

	// A real user created it -> show them as the inviter; system invites stay
	// generic (null inviter).
	let inviterName: string | null = null;
	if (row.createdByUserId) {
		const [u] = await db
			.select({ name: user.name })
			.from(user)
			.where(eq(user.id, row.createdByUserId))
			.limit(1);
		inviterName = u?.name ?? null;
	}

	return json({ state: 'valid', inviterName, invitedEmail: row.invitedEmail ?? null });
};
