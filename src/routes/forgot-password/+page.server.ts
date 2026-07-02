import { fail } from '@sveltejs/kit';
import { APIError } from 'better-auth/api';
import { auth } from '$lib/server/auth';
import type { Actions } from './$types';

export const actions: Actions = {
	default: async ({ request }) => {
		const data = await request.formData();
		const email = data.get('email')?.toString().trim() ?? '';
		if (!email) return fail(400, { email, message: 'Enter your email address.' });

		try {
			// redirectTo is where the reset link lands after better-auth validates
			// the token; it arrives there as ?token=... (see /reset-password).
			await auth.api.requestPasswordReset({ body: { email, redirectTo: '/reset-password' } });
		} catch (error) {
			// better-auth already avoids leaking whether an account exists, so we
			// only surface genuinely unexpected failures.
			if (!(error instanceof APIError)) {
				return fail(500, { email, message: 'Something went wrong. Try again.' });
			}
		}

		// Always report success to avoid revealing which emails are registered.
		return { sent: true, email };
	}
};
