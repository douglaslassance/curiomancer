import { fail, redirect } from '@sveltejs/kit';
import { APIError } from 'better-auth/api';
import { auth } from '$lib/server/auth';
import { getPostHogClient } from '$lib/server/posthog';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = (event) => {
	if (event.locals.user) throw redirect(302, '/places');
	return {};
};

export const actions: Actions = {
	default: async (event) => {
		const data = await event.request.formData();
		const email = data.get('email')?.toString() ?? '';
		const password = data.get('password')?.toString() ?? '';

		if (!email || !password) {
			return fail(400, { email, message: 'Email and password are required.' });
		}

		let userId: string | null = null;
		try {
			const result = await auth.api.signInEmail({ body: { email, password } });
			userId = result?.user?.id ?? null;
		} catch (error) {
			if (error instanceof APIError) {
				// better-auth resends the verification email on this attempt
				// (emailVerification.sendOnSignIn), so this doubles as "resend".
				const message =
					error.message === 'Email not verified'
						? 'Check your email to verify your account first - we just sent you a fresh link.'
						: error.message || 'Sign-in failed.';
				return fail(400, { email, message });
			}
			return fail(500, { email, message: 'Unexpected error. Try again.' });
		}

		if (userId) {
			const posthog = getPostHogClient();
			posthog.capture({ distinctId: userId, event: 'user_signed_in' });
		}

		throw redirect(302, '/places');
	}
};
