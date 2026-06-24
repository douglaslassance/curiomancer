import { fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { placeRelation, user, userLocation } from '$lib/server/db/schema';
import { createApiToken, listApiTokens, revokeApiToken } from '$lib/server/api-tokens';
import { parseInstagramHandle } from '$lib/instagram';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(302, '/sign-in?next=/settings');

	const [[location], likes, apiTokens] = await Promise.all([
		db.select().from(userLocation).where(eq(userLocation.userId, locals.user.id)).limit(1),
		db
			.select({ id: placeRelation.id })
			.from(placeRelation)
			.where(eq(placeRelation.userId, locals.user.id)),
		listApiTokens(locals.user.id)
	]);

	return {
		profile: {
			name: locals.user.name,
			email: locals.user.email,
			image: locals.user.image ?? null,
			role: locals.user.role ?? 'user',
			instagram: locals.user.instagram ?? null
		},
		location: location ?? null,
		likeCount: likes.length,
		apiTokens
	};
};

export const actions: Actions = {
	updateInstagram: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { message: 'Not signed in.' });

		const data = await request.formData();
		const raw = data.get('instagram')?.toString() ?? '';

		// Empty string clears the handle - they took theirs off.
		if (raw.trim() === '') {
			await db.update(user).set({ instagram: null }).where(eq(user.id, locals.user.id));
			return { instagramOk: true, instagram: null };
		}

		const handle = parseInstagramHandle(raw);
		if (!handle) {
			return fail(400, {
				instagramError: "That doesn't look like a valid Instagram handle.",
				instagram: raw
			});
		}

		await db.update(user).set({ instagram: handle }).where(eq(user.id, locals.user.id));
		return { instagramOk: true, instagram: handle };
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
