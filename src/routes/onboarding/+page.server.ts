import { redirect } from '@sveltejs/kit';
import { isMobileUserAgent } from '$lib/server/user-agent';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, request }) => {
	if (!locals.user) throw redirect(302, '/sign-in?next=/onboarding');
	// Onboarding exists only to offer the Google Maps import, which is impractical
	// on a phone. So a phone skips the whole page and goes straight to the
	// home, where the cold-start flow nudges them to Tune.
	if (isMobileUserAgent(request.headers.get('user-agent'))) throw redirect(302, '/');
	return { firstName: locals.user.name.split(/\s+/)[0] ?? '' };
};
