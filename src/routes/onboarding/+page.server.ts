import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(302, '/sign-in?next=/onboarding');
	return { firstName: locals.user.name.split(/\s+/)[0] ?? '' };
};
