import { fail, redirect } from '@sveltejs/kit';
import { APIError } from 'better-auth/api';
import { eq } from 'drizzle-orm';
import { auth } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { placeRelation, userLocation } from '$lib/server/db/schema';
import { getInvitesFor } from '$lib/server/invites';
import { createApiToken, listApiTokens, revokeApiToken } from '$lib/server/api-tokens';
import { listBlockedUsers, unblockUser } from '$lib/server/blocks';
import { getPostHogClient } from '$lib/server/posthog';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(302, '/sign-in?next=/settings');

	const [[location], likes, invites, apiTokens, blockedUsers] = await Promise.all([
		db.select().from(userLocation).where(eq(userLocation.userId, locals.user.id)).limit(1),
		db
			.select({ id: placeRelation.id })
			.from(placeRelation)
			.where(eq(placeRelation.userId, locals.user.id)),
		getInvitesFor(locals.user.id),
		listApiTokens(locals.user.id),
		listBlockedUsers(locals.user.id)
	]);

	return {
		profile: {
			name: locals.user.name,
			email: locals.user.email,
			image: locals.user.image ?? null,
			role: locals.user.role ?? 'user',
			messageable: locals.user.messageable ?? true
		},
		location: location ?? null,
		likeCount: likes.length,
		invites,
		apiTokens,
		blockedUsers
	};
};

export const actions: Actions = {
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
		const posthog = getPostHogClient();
		posthog.capture({
			distinctId: locals.user.id,
			event: 'profile_updated',
			properties: { field: 'name' }
		});
		return { nameOk: true, name };
	},

	updateAvatar: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { message: 'Not signed in.' });

		const data = await request.formData();
		const image = data.get('image')?.toString() ?? '';
		// The client downscales to a small square data URI before posting.
		if (!image.startsWith('data:image/')) {
			return fail(400, { avatarError: 'Please choose an image file.' });
		}
		if (image.length > 500_000) {
			return fail(400, { avatarError: 'That image is too large. Try a smaller one.' });
		}

		try {
			await auth.api.updateUser({ body: { image }, headers: request.headers });
		} catch (error) {
			if (error instanceof APIError) return fail(400, { avatarError: error.message });
			return fail(500, { avatarError: 'Could not update your photo.' });
		}
		return { avatarOk: true };
	},

	removeAvatar: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { message: 'Not signed in.' });
		try {
			await auth.api.updateUser({ body: { image: '' }, headers: request.headers });
		} catch (error) {
			if (error instanceof APIError) return fail(400, { avatarError: error.message });
			return fail(500, { avatarError: 'Could not remove your photo.' });
		}
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

		// Plaintext is returned once here and never stored - the UI shows it
		// in a copy-now box and it cannot be retrieved again.
		const token = await createApiToken(locals.user.id, name);
		const posthog = getPostHogClient();
		posthog.capture({ distinctId: locals.user.id, event: 'api_token_created' });
		return { tokenCreated: token, tokenName: name };
	},

	revokeToken: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { message: 'Not signed in.' });

		const data = await request.formData();
		const id = data.get('id')?.toString() ?? '';
		if (id) await revokeApiToken(locals.user.id, id);
		return { tokenRevoked: true };
	},

	updateMessageable: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { message: 'Not signed in.' });

		const data = await request.formData();
		const messageable = data.get('messageable') === 'true';

		try {
			await auth.api.updateUser({ body: { messageable }, headers: request.headers });
		} catch (error) {
			if (error instanceof APIError) return fail(400, { messageableError: error.message });
			return fail(500, { messageableError: 'Could not update this setting.' });
		}
		return { messageableOk: true, messageable };
	},

	unblockUser: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { message: 'Not signed in.' });

		const data = await request.formData();
		const id = data.get('id')?.toString() ?? '';
		if (id) await unblockUser(locals.user.id, id);
		return { unblocked: true };
	}
};
