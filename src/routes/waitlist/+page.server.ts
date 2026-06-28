import { fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { waitlist } from '$lib/server/db/schema';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	// Signed-in users have no reason to be here.
	if (locals.user) throw redirect(302, '/');
	return {};
};

export const actions: Actions = {
	default: async ({ request }) => {
		const data = await request.formData();
		const email = data.get('email')?.toString().trim().toLowerCase() ?? '';
		const city = data.get('city')?.toString().trim() || null;

		// Light validation - the unique index does the real dedupe.
		if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
			return fail(400, { email, city, message: 'Enter a valid email address.' });
		}

		// Joining twice is not an error; we just don't create a duplicate row.
		await db.insert(waitlist).values({ email, city }).onConflictDoNothing();

		return { joined: true };
	}
};
