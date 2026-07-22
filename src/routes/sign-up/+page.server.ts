import { fail, redirect } from '@sveltejs/kit';
import { APIError } from 'better-auth/api';
import { eq } from 'drizzle-orm';
import { auth } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { user, userLocation } from '$lib/server/db/schema';
import { findRedeemableInvite, redeemInvite } from '$lib/server/invites';
import { geocodeApple } from '$lib/server/maps-search';
import { reverseGeocode } from '$lib/server/location';
import { getPostHogClient } from '$lib/server/posthog';
import type { Actions, PageServerLoad } from './$types';

/**
 * Store the new user's home location from the sign-up form. Best-effort: any
 * failure (bad city, geocode hiccup) is swallowed so it never blocks account
 * creation - home's location prompt is the fallback. Uses the coords
 * from "Detect" when present, otherwise forward-geocodes the typed city.
 */
async function storeSignupLocation(
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

/**
 * Sign-up is strictly invite-gated. The very first admin comes in
 * through /setup (only available when the DB has zero users); after
 * that the only way in is a valid, unredeemed invite code.
 */
export const load: PageServerLoad = async (event) => {
	if (event.locals.user) throw redirect(302, '/');

	// If no users exist yet, send them to /setup instead. Avoids confusing
	// "invite required" copy when there are literally no inviters.
	const [firstUser] = await db.select({ id: user.id }).from(user).limit(1);
	if (!firstUser) throw redirect(302, '/setup');

	const code = event.url.searchParams.get('invite')?.trim() ?? null;
	let inviter: { name: string } | null = null;
	let inviteState: 'absent' | 'valid' | 'invalid' = 'absent';

	if (code) {
		const row = await findRedeemableInvite(code);
		if (row) {
			// A redeemable code is valid regardless of creator. If a real user
			// created it, show them as the inviter; system invites stay generic.
			inviteState = 'valid';
			if (row.createdByUserId) {
				const [u] = await db
					.select({ name: user.name })
					.from(user)
					.where(eq(user.id, row.createdByUserId))
					.limit(1);
				if (u) inviter = { name: u.name };
			}
		} else {
			inviteState = 'invalid';
		}
	}

	return { code, inviter, inviteState };
};

export const actions: Actions = {
	default: async (event) => {
		const data = await event.request.formData();
		const name = data.get('name')?.toString() ?? '';
		const email = data.get('email')?.toString() ?? '';
		const password = data.get('password')?.toString() ?? '';
		const code = data.get('invite')?.toString().trim() || null;
		const city = data.get('city')?.toString().trim() ?? '';
		const latitude = data.get('latitude')?.toString() ?? '';
		const longitude = data.get('longitude')?.toString() ?? '';

		if (!name || !email || !password) {
			return fail(400, { name, email, message: 'All fields are required.' });
		}
		if (password.length < 8) {
			return fail(400, {
				name,
				email,
				message: 'Password must be at least 8 characters.'
			});
		}

		if (!code) {
			return fail(400, {
				name,
				email,
				message: 'Curiomancer is invite-only. You need a code from a friend on Curiomancer.'
			});
		}
		const existing = await findRedeemableInvite(code);
		if (!existing) {
			return fail(400, {
				name,
				email,
				message: 'That invite code is invalid or already used.'
			});
		}

		let newUserId: string | null;
		try {
			const result = await auth.api.signUpEmail({ body: { name, email, password } });
			newUserId = result?.user?.id ?? null;
		} catch (error) {
			if (error instanceof APIError) {
				return fail(400, {
					name,
					email,
					message: error.message || 'Sign-up failed.'
				});
			}
			return fail(500, {
				name,
				email,
				message: 'Unexpected error. Try again.'
			});
		}

		// Redeem the invite atomically; if somebody beat us to it, roll back
		// so the email is free for another attempt. Any error while redeeming
		// must also roll the user back - otherwise a thrown redeem would orphan
		// a created account with the email taken and no way to retry.
		if (code && newUserId) {
			let redeemed = false;
			try {
				redeemed = await redeemInvite(code, newUserId);
			} catch (err) {
				console.error('Invite redemption threw after sign-up; rolling back user:', err);
				await db.delete(user).where(eq(user.id, newUserId));
				return fail(500, { name, email, message: 'Unexpected error. Try again.' });
			}
			if (!redeemed) {
				await db.delete(user).where(eq(user.id, newUserId));
				return fail(400, {
					name,
					email,
					message: 'That invite was just used by someone else. Try another.'
				});
			}
		}

		if (newUserId) {
			await storeSignupLocation(newUserId, city, latitude, longitude);

			getPostHogClient()?.capture({
				distinctId: newUserId,
				event: 'user_signed_up',
				properties: { invite_code: code ?? null }
			});
		}

		// requireEmailVerification means signUpEmail doesn't create a session,
		// so there's nothing to redirect into yet - show a "check your email"
		// state instead.
		return { verifyEmailSent: true, email };
	}
};
