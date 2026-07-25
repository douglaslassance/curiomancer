import { fail } from '@sveltejs/kit';
import { isAdmin } from '$lib/server/admin';
import { adminRevokeApiToken, getAllApiTokens } from '$lib/server/api-tokens';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const tokens = await getAllApiTokens();
	return { tokens };
};

export const actions: Actions = {
	revoke: async ({ request, locals }) => {
		if (!isAdmin(locals.user)) return fail(403, { message: 'Admins only.' });

		const id = (await request.formData()).get('id')?.toString() ?? '';
		if (!id) return fail(400, { message: 'Missing token id.' });

		const removed = await adminRevokeApiToken(id);
		if (!removed) return fail(404, { message: 'Token not found.' });
		return { revoked: true };
	}
};
