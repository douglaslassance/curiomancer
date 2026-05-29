import { error, redirect } from '@sveltejs/kit';
import { isAdmin } from '$lib/server/admin';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, url }) => {
	if (!locals.user) throw redirect(302, `/sign-in?next=${url.pathname}`);
	if (!isAdmin(locals.user as { role?: string })) {
		throw error(403, 'Admin access only.');
	}
	return {};
};
