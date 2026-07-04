import { redirect } from '@sveltejs/kit';
import { auth } from '$lib/server/auth';
import { getPostHogClient } from '$lib/server/posthog';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = () => {
	throw redirect(302, '/');
};

export const actions: Actions = {
	default: async (event) => {
		const userId = event.locals.user?.id;
		await auth.api.signOut({ headers: event.request.headers });
		if (userId) {
			const posthog = getPostHogClient();
			posthog.capture({ distinctId: userId, event: 'user_signed_out' });
		}
		throw redirect(302, '/');
	}
};
