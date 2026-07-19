import { fail, redirect } from '@sveltejs/kit';
import { APIError } from 'better-auth/api';
import { eq } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { auth } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { placeRelation, user, userLocation } from '$lib/server/db/schema';
import { sendInviteEmail } from '$lib/server/email';
import {
	countInvitesCreatedBy,
	createInvite,
	deleteOwnInvite,
	getInvitesFor,
	hasPendingInviteForEmail,
	isEmailRegistered
} from '$lib/server/invites';
import { clearRatings } from '$lib/server/likes';
import { getOrCreateMapShareToken } from '$lib/server/map-share';
import { createApiToken, countApiTokens, listApiTokens, revokeApiToken } from '$lib/server/api-tokens';
import { listBlockedUsers, unblockUser } from '$lib/server/blocks';
import { getActiveSubscription, latestCustomerId } from '$lib/server/subscriptions';
import { getStripe, stripeEnabled } from '$lib/server/stripe';
import { getPostHogClient } from '$lib/server/posthog';
import { uploadAvatar, deleteAvatar, AvatarValidationError } from '$lib/server/storage';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(302, '/sign-in?next=/settings');

	const [[location], ratings, invites, apiTokens, blockedUsers, subscription, mapShareToken] =
		await Promise.all([
			db.select().from(userLocation).where(eq(userLocation.userId, locals.user.id)).limit(1),
			// Every kind counts as a rating (liked/disliked/seen/want-to-go).
			db
				.select({ id: placeRelation.id })
				.from(placeRelation)
				.where(eq(placeRelation.userId, locals.user.id)),
			getInvitesFor(locals.user.id),
			listApiTokens(locals.user.id),
			listBlockedUsers(locals.user.id),
			getActiveSubscription(locals.user.id),
			getOrCreateMapShareToken(locals.user.id)
		]);

	return {
		profile: {
			id: locals.user.id,
			name: locals.user.name,
			email: locals.user.email,
			image: locals.user.image ?? null,
			role: locals.user.role ?? 'user',
			incognito: locals.user.incognito ?? false
		},
		location: location ?? null,
		ratingCount: ratings.length,
		invites,
		inviteLimit: locals.user.inviteLimit ?? 3,
		apiTokens,
		apiTokenLimit: locals.user.apiTokenLimit ?? 3,
		blockedUsers,
		subscription,
		mapShareToken
	};
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const actions: Actions = {
	// Invite a friend by email: mint an invite (creator = me), send them the link.
	// Capped by my `invite_limit`; cancelling a pending one frees a slot.
	createInvite: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { message: 'Not signed in.' });

		const email =
			(await request.formData()).get('recipient')?.toString().trim().toLowerCase() ?? '';
		if (!EMAIL_RE.test(email)) return fail(400, { inviteError: 'Enter a valid email address.' });

		if (await isEmailRegistered(email)) {
			return fail(400, { inviteError: 'That person is already on Curiomancer.' });
		}
		if (await hasPendingInviteForEmail(email)) {
			return fail(400, { inviteError: "They've already been invited. Copy or cancel that invite." });
		}

		const limit = locals.user.inviteLimit ?? 3;
		if ((await countInvitesCreatedBy(locals.user.id)) >= limit) {
			return fail(400, {
				inviteError: `You've used all ${limit} of your invites. Cancel a pending one to free a slot.`
			});
		}

		const code = await createInvite(locals.user.id, email);
		try {
			const inviteUrl = `${env.ORIGIN}/sign-up?invite=${encodeURIComponent(code)}`;
			await sendInviteEmail(email, inviteUrl, locals.user.name);
		} catch (err) {
			console.error('Invite email failed:', err);
		}
		getPostHogClient()?.capture({ distinctId: locals.user.id, event: 'invite_sent' });
		return { invited: email };
	},

	cancelInvite: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { message: 'Not signed in.' });
		const id = (await request.formData()).get('id')?.toString() ?? '';
		if (id) await deleteOwnInvite(locals.user.id, id);
		return { inviteCancelled: true };
	},

	updateName: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { message: 'Not signed in.' });

		const data = await request.formData();
		const name = data.get('name')?.toString().trim() ?? '';
		if (!name) return fail(400, { nameError: 'Name cannot be empty.', name });
		if (name.length > 100) return fail(400, { nameError: 'Name is too long.', name });

		try {
			await auth.api.updateUser({ body: { name }, headers: request.headers });
		} catch (error) {
			if (error instanceof APIError) return fail(400, { nameError: error.message, name });
			return fail(500, { nameError: 'Could not update name.', name });
		}
		getPostHogClient()?.capture({
			distinctId: locals.user.id,
			event: 'profile_updated',
			properties: { field: 'name' }
		});
		return { nameOk: true, name };
	},

	updateEmail: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { message: 'Not signed in.' });

		const data = await request.formData();
		const email = data.get('email')?.toString().trim().toLowerCase() ?? '';
		if (!email) return fail(400, { emailError: 'Email cannot be empty.', email });
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
			return fail(400, { emailError: 'Enter a valid email address.', email });
		}
		if (email === locals.user.email.toLowerCase()) {
			return fail(400, { emailError: "That's already your email.", email });
		}

		// Sends a verification link to the new address; the change only lands once
		// they click it (auth.ts wires the recipient + copy). Nothing changes yet.
		try {
			await auth.api.changeEmail({
				body: { newEmail: email, callbackURL: '/settings?emailChanged=1' },
				headers: request.headers
			});
		} catch (error) {
			if (error instanceof APIError) return fail(400, { emailError: error.message, email });
			return fail(500, { emailError: 'Could not start the email change. Try again.' });
		}
		getPostHogClient()?.capture({ distinctId: locals.user.id, event: 'email_change_requested' });
		return { emailPending: true, email };
	},

	updateAvatar: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { message: 'Not signed in.' });

		const data = await request.formData();
		// The client downscales to a small square data URI before posting;
		// uploadAvatar re-validates the type/size and stores it on R2.
		const image = data.get('image')?.toString() ?? '';
		let uploaded: string;
		try {
			uploaded = await uploadAvatar(image);
		} catch (error) {
			if (error instanceof AvatarValidationError) return fail(400, { avatarError: error.message });
			return fail(500, { avatarError: 'Could not upload your photo.' });
		}

		const previousImage = locals.user.image;
		try {
			await auth.api.updateUser({ body: { image: uploaded }, headers: request.headers });
		} catch (error) {
			await deleteAvatar(uploaded).catch(() => {});
			if (error instanceof APIError) return fail(400, { avatarError: error.message });
			return fail(500, { avatarError: 'Could not update your photo.' });
		}
		await deleteAvatar(previousImage).catch(() => {});
		return { avatarOk: true };
	},

	removeAvatar: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { message: 'Not signed in.' });
		const previousImage = locals.user.image;
		try {
			await auth.api.updateUser({ body: { image: '' }, headers: request.headers });
		} catch (error) {
			if (error instanceof APIError) return fail(400, { avatarError: error.message });
			return fail(500, { avatarError: 'Could not remove your photo.' });
		}
		await deleteAvatar(previousImage).catch(() => {});
		return { avatarOk: true };
	},

	changePassword: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { message: 'Not signed in.' });

		const data = await request.formData();
		const currentPassword = data.get('currentPassword')?.toString() ?? '';
		const newPassword = data.get('newPassword')?.toString() ?? '';

		if (!currentPassword || !newPassword) {
			return fail(400, { passwordError: 'Both current and new password are required.' });
		}
		if (newPassword.length < 8) {
			return fail(400, { passwordError: 'New password must be at least 8 characters.' });
		}

		try {
			await auth.api.changePassword({
				body: { currentPassword, newPassword },
				headers: request.headers
			});
		} catch (error) {
			if (error instanceof APIError) {
				return fail(400, { passwordError: error.message || 'Could not change password.' });
			}
			return fail(500, { passwordError: 'Unexpected error. Try again.' });
		}
		return { passwordOk: true };
	},

	createToken: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { message: 'Not signed in.' });

		const data = await request.formData();
		const name = data.get('name')?.toString().trim() ?? '';
		if (!name) {
			return fail(400, { tokenError: 'Give the token a name so you can recognise it later.' });
		}

		const tokenLimit = locals.user.apiTokenLimit ?? 3;
		if ((await countApiTokens(locals.user.id)) >= tokenLimit) {
			return fail(400, {
				tokenError: `You can have at most ${tokenLimit} tokens. Revoke one to create another.`
			});
		}

		// Plaintext is returned once here and never stored - the UI shows it once
		// (inline on the new token's row) and it cannot be retrieved again.
		const token = await createApiToken(locals.user.id, name);
		getPostHogClient()?.capture({ distinctId: locals.user.id, event: 'api_token_created' });
		return { tokenCreated: token, tokenName: name };
	},

	revokeToken: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { message: 'Not signed in.' });

		const data = await request.formData();
		const id = data.get('id')?.toString() ?? '';
		if (id) await revokeApiToken(locals.user.id, id);
		return { tokenRevoked: true };
	},

	updateIncognito: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { message: 'Not signed in.' });

		const data = await request.formData();
		const incognito = data.get('incognito') === 'true';

		try {
			await auth.api.updateUser({ body: { incognito }, headers: request.headers });
		} catch (error) {
			if (error instanceof APIError) return fail(400, { incognitoError: error.message });
			return fail(500, { incognitoError: 'Could not update this setting.' });
		}
		return { incognitoOk: true, incognito };
	},

	unblockUser: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { message: 'Not signed in.' });

		const data = await request.formData();
		const id = data.get('id')?.toString() ?? '';
		if (id) await unblockUser(locals.user.id, id);
		return { unblocked: true };
	},

	// Opens the Stripe Customer Portal so the user can update payment method,
	// see invoices, or cancel. Only Stripe-backed subscribers have a customer id.
	portal: async ({ locals, url }) => {
		if (!locals.user) return fail(401, { message: 'Not signed in.' });
		if (!stripeEnabled()) return fail(503, { message: 'Billing is not available right now.' });

		const customerId = await latestCustomerId(locals.user.id);
		if (!customerId) return fail(400, { message: 'No billing account to manage.' });

		const session = await getStripe().billingPortal.sessions.create({
			customer: customerId,
			return_url: `${url.origin}/settings`
		});
		throw redirect(303, session.url);
	},

	// Delete every one of the user's ratings (place_relation rows). Destructive
	// and irreversible - the UI gates it behind a confirmation dialog and offers
	// an export first.
	resetRatings: async ({ locals }) => {
		if (!locals.user) return fail(401, { message: 'Not signed in.' });
		const removed = await clearRatings(locals.user.id);
		getPostHogClient()?.capture({
			distinctId: locals.user.id,
			event: 'ratings_reset',
			properties: { removed }
		});
		return { ratingsReset: true, removed };
	},

	// Permanently delete the account. This cascades to the user's ratings and
	// their conversations/messages (both sides) - see the schema FKs. There is
	// no undo, so the UI gates it behind a confirmation dialog.
	deleteAccount: async ({ locals }) => {
		if (!locals.user) return fail(401, { message: 'Not signed in.' });
		const userId = locals.user.id;

		// Drop the avatar from R2 while we still have the reference.
		await deleteAvatar(locals.user.image).catch(() => {});

		// Deleting the user row cascades place_relation, conversation, message,
		// session, account, and location rows via ON DELETE CASCADE.
		await db.delete(user).where(eq(user.id, userId));

		getPostHogClient()?.capture({ distinctId: userId, event: 'account_deleted' });
		throw redirect(303, '/');
	}
};
