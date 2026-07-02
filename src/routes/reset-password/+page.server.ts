import { fail, redirect } from '@sveltejs/kit';
import { APIError } from 'better-auth/api';
import { auth } from '$lib/server/auth';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url }) => {
	const token = url.searchParams.get('token');
	const errorParam = url.searchParams.get('error');
	// better-auth redirects here with ?token=... on success, or ?error=INVALID_TOKEN.
	return { token, invalid: !token || errorParam === 'INVALID_TOKEN' };
};

export const actions: Actions = {
	default: async ({ request }) => {
		const data = await request.formData();
		const token = data.get('token')?.toString() ?? '';
		const newPassword = data.get('newPassword')?.toString() ?? '';
		const confirm = data.get('confirm')?.toString() ?? '';

		if (!token)
			return fail(400, { message: 'This reset link is missing its token. Request a new one.' });
		if (newPassword.length < 8) {
			return fail(400, { message: 'Password must be at least 8 characters.' });
		}
		if (newPassword !== confirm) return fail(400, { message: 'Passwords do not match.' });

		try {
			await auth.api.resetPassword({ body: { newPassword, token } });
		} catch (error) {
			if (error instanceof APIError) {
				return fail(400, {
					message: error.message || 'Could not reset password. The link may have expired.'
				});
			}
			return fail(500, { message: 'Unexpected error. Try again.' });
		}

		throw redirect(303, '/sign-in?reset=1');
	}
};
