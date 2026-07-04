import { fail } from '@sveltejs/kit';
import { sendContactEmail } from '$lib/server/email';
import type { Actions } from './$types';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const actions: Actions = {
	default: async (event) => {
		const data = await event.request.formData();
		const email = data.get('email')?.toString().trim() ?? '';
		const subject = data.get('subject')?.toString().trim() ?? '';
		const message = data.get('message')?.toString().trim() ?? '';

		if (!emailPattern.test(email) || !subject || !message) {
			return fail(400, {
				email,
				subject,
				message,
				error: 'Please fill out every field with a valid email.'
			});
		}

		try {
			await sendContactEmail(email, subject, message);
		} catch (err) {
			console.error('Contact form email failed:', err);
			return fail(500, {
				email,
				subject,
				message,
				error: 'Something went wrong sending your message. Please try again.'
			});
		}

		return { success: true };
	}
};
