import { fail, redirect } from '@sveltejs/kit';
import { APIError } from 'better-auth/api';
import { auth } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { user } from '$lib/server/db/schema';
import type { Actions, PageServerLoad } from './$types';

/**
 * Open registration. The very first account is bootstrapped through /setup
 * (which promotes it to admin); everyone after that registers freely here.
 */
export const load: PageServerLoad = async (event) => {
	if (event.locals.user) throw redirect(302, '/');

	// No users yet? Send them to /setup to claim the admin account.
	const [firstUser] = await db.select({ id: user.id }).from(user).limit(1);
	if (!firstUser) throw redirect(302, '/setup');

	return {};
};

export const actions: Actions = {
	default: async (event) => {
		const data = await event.request.formData();
		const name = data.get('name')?.toString() ?? '';
		const email = data.get('email')?.toString() ?? '';
		const password = data.get('password')?.toString() ?? '';

		if (!name || !email || !password) {
			return fail(400, { name, email, message: 'All fields are required.' });
		}
		if (password.length < 8) {
			return fail(400, { name, email, message: 'Password must be at least 8 characters.' });
		}

		try {
			await auth.api.signUpEmail({ body: { name, email, password } });
		} catch (error) {
			if (error instanceof APIError) {
				return fail(400, { name, email, message: error.message || 'Sign-up failed.' });
			}
			return fail(500, { name, email, message: 'Unexpected error. Try again.' });
		}

		throw redirect(302, '/');
	}
};
