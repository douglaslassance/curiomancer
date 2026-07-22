import { eq } from 'drizzle-orm';
import { APIError } from 'better-auth/api';
import { auth } from './auth';
import { db } from './db';
import { user, userLocation } from './db/schema';
import { findRedeemableInvite, redeemInvite } from './invites';
import { geocodeApple } from './maps-search';
import { reverseGeocode } from './location';
import { getPostHogClient } from './posthog';

/**
 * Store the new user's home location from the sign-up form. Best-effort: any
 * failure (bad city, geocode hiccup) is swallowed so it never blocks account
 * creation - home's location prompt is the fallback. Uses the coords from
 * "Detect" (or the device) when present, otherwise forward-geocodes the typed
 * city.
 */
export async function storeSignupLocation(
	userId: string,
	cityInput: string,
	latRaw: string,
	lngRaw: string
): Promise<void> {
	try {
		let coords: { latitude: number; longitude: number } | null = null;
		const lat = Number(latRaw);
		const lng = Number(lngRaw);
		if (latRaw && lngRaw && isFinite(lat) && isFinite(lng)) {
			coords = { latitude: lat, longitude: lng };
		} else if (cityInput) {
			coords = await geocodeApple(cityInput);
		}
		if (!coords) return;

		const resolved = await reverseGeocode(coords.latitude, coords.longitude);
		await db
			.insert(userLocation)
			.values({
				userId,
				city: resolved.city,
				countryCode: resolved.countryCode,
				latitude: coords.latitude,
				longitude: coords.longitude,
				timezone: resolved.timezone
			})
			.onConflictDoNothing();
	} catch (err) {
		console.error('Sign-up location store failed (non-fatal):', err);
	}
}

export interface InvitedSignupInput {
	name: string;
	email: string;
	password: string;
	code: string | null;
	city?: string;
	latitude?: string;
	longitude?: string;
}

export type InvitedSignupResult =
	| { ok: true; userId: string; email: string }
	| { ok: false; status: 400 | 500; message: string };

/**
 * Create an account from an invite. Shared by the web /sign-up form action and
 * the native `POST /api/v1/auth/signup` so the invite-gating, email-binding,
 * and rollback logic can't drift between them.
 *
 * Sign-up is strictly invite-gated: a valid, unredeemed code is required, and a
 * code bound to a specific address can only be redeemed by that address (a
 * forwarded code can't create an account for someone else). `requireEmailVerification`
 * means no session/token is created here - the caller shows a "check your email"
 * state, and the user signs in once verified.
 */
export async function createInvitedUser(input: InvitedSignupInput): Promise<InvitedSignupResult> {
	const name = input.name.trim();
	const email = input.email.trim();
	const password = input.password;
	const code = input.code?.trim() || null;

	if (!name || !email || !password) {
		return { ok: false, status: 400, message: 'All fields are required.' };
	}
	if (password.length < 8) {
		return { ok: false, status: 400, message: 'Password must be at least 8 characters.' };
	}
	if (!code) {
		return {
			ok: false,
			status: 400,
			message: 'Curiomancer is invite-only. You need a code from a friend on Curiomancer.'
		};
	}

	const existing = await findRedeemableInvite(code);
	if (!existing) {
		return { ok: false, status: 400, message: 'That invite code is invalid or already used.' };
	}

	// An invite is bound to the address it was sent to. The code can be passed
	// around, but only the invited email can redeem it. Open invites (no
	// invitedEmail) stay usable by any address.
	if (existing.invitedEmail && existing.invitedEmail.trim().toLowerCase() !== email.toLowerCase()) {
		return {
			ok: false,
			status: 400,
			message:
				'This invite is for a different email address. Sign up with the address it was sent to.'
		};
	}

	let newUserId: string | null;
	try {
		const result = await auth.api.signUpEmail({ body: { name, email, password } });
		newUserId = result?.user?.id ?? null;
	} catch (error) {
		if (error instanceof APIError) {
			return { ok: false, status: 400, message: error.message || 'Sign-up failed.' };
		}
		return { ok: false, status: 500, message: 'Unexpected error. Try again.' };
	}

	if (!newUserId) {
		return { ok: false, status: 500, message: 'Unexpected error. Try again.' };
	}

	// Redeem the invite atomically; if somebody beat us to it, roll the new user
	// back so the email is free for another attempt. A thrown redeem must also
	// roll back - otherwise it orphans an account with the email taken.
	let redeemed = false;
	try {
		redeemed = await redeemInvite(code, newUserId);
	} catch (err) {
		console.error('Invite redemption threw after sign-up; rolling back user:', err);
		await db.delete(user).where(eq(user.id, newUserId));
		return { ok: false, status: 500, message: 'Unexpected error. Try again.' };
	}
	if (!redeemed) {
		await db.delete(user).where(eq(user.id, newUserId));
		return {
			ok: false,
			status: 400,
			message: 'That invite was just used by someone else. Try another.'
		};
	}

	await storeSignupLocation(
		newUserId,
		input.city?.trim() ?? '',
		input.latitude ?? '',
		input.longitude ?? ''
	);

	getPostHogClient()?.capture({
		distinctId: newUserId,
		event: 'user_signed_up',
		properties: { invite_code: code }
	});

	return { ok: true, userId: newUserId, email };
}
