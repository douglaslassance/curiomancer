import { redirect } from '@sveltejs/kit';
import { auth } from '$lib/server/auth';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = () => {
	throw redirect(302, '/');
};

export const actions: Actions = {
	default: async (event) => {
		await auth.api.signOut({ headers: event.request.headers });
		throw redirect(302, '/');
	}
};
