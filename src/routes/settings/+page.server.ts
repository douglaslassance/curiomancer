import { fail, redirect } from '@sveltejs/kit';
import { APIError } from 'better-auth/api';
import { eq } from 'drizzle-orm';
import { auth } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { placeRelation, userLocation } from '$lib/server/db/schema';
import { getInvitesFor } from '$lib/server/invites';
import { createApiToken, listApiTokens, revokeApiToken } from '$lib/server/api-tokens';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(302, '/sign-in?next=/settings');

	const [[location], likes, invites, apiTokens] = await Promise.all([
		db.select().from(userLocation).where(eq(userLocation.userId, locals.user.id)).limit(1),
		db
			.select({ id: placeRelation.id })
			.from(placeRelation)
			.where(eq(placeRelation.userId, locals.user.id)),
		getInvitesFor(locals.user.id),
		listApiTokens(locals.user.id)
	]);

	return {
		profile: {
			name: locals.user.name,
			email: locals.user.email,
			image: locals.user.image ?? null,
			role: locals.user.role ?? 'user'
		},
		location: location ?? null,
		likeCount: likes.length,
		invites,
		apiTokens
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
		return { nameOk: true, name };
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
		return { tokenCreated: token, tokenName: name };
	},

	revokeToken: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { message: 'Not signed in.' });

		const data = await request.formData();
		const id = data.get('id')?.toString() ?? '';
		if (id) await revokeApiToken(locals.user.id, id);
		return { tokenRevoked: true };
	}
};
