import { fail, redirect } from '@sveltejs/kit';
import { APIError } from 'better-auth/api';
import { eq } from 'drizzle-orm';
import { auth } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { user } from '$lib/server/db/schema';
import type { Actions, PageServerLoad } from './$types';

/**
 * First-time setup. Visible only when the database has zero users; the
 * very first signup runs here and is automatically promoted to admin.
 *
 * After at least one user exists, this route redirects to /sign-in. The
 * invariant is "no users, ever" - not "no admins" - so deleting your only
 * admin doesn't reopen the setup window. That prevents takeover via
 * "wipe the admin and re-claim."
 *
 * Mirrors the pattern used at ~/Projects/kitsch.tv.
 */
async function hasAnyUser(): Promise<boolean> {
	const [first] = await db.select({ id: user.id }).from(user).limit(1);
	return !!first;
}

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user) throw redirect(302, '/');
	if (await hasAnyUser()) throw redirect(302, '/sign-in');
	return {};
};

export const actions: Actions = {
	default: async (event) => {
		// Re-check at action time - somebody else might have just claimed it.
		if (await hasAnyUser()) throw redirect(302, '/sign-in');

		const data = await event.request.formData();
		const name = data.get('name')?.toString() ?? '';
		const email = data.get('email')?.toString() ?? '';
		const password = data.get('password')?.toString() ?? '';

		if (!name || !email || !password) {
			return fail(400, { name, email, message: 'All fields are required.' });
		}
		if (password.length < 8) {
			return fail(400, {
				name,
				email,
				message: 'Password must be at least 8 characters.'
			});
		}

		try {
			await auth.api.signUpEmail({ body: { name, email, password } });
		} catch (error) {
			if (error instanceof APIError) {
				return fail(400, {
					name,
					email,
					message: error.message || 'Setup failed.'
				});
			}
			return fail(500, {
				name,
				email,
				message: 'Unexpected error. Try again.'
			});
		}

		// The first user is always the platform admin.
		await db.update(user).set({ role: 'admin' }).where(eq(user.email, email));

		throw redirect(302, '/');
	}
};
