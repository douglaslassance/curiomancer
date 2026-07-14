import { fail } from '@sveltejs/kit';
import { sendContactEmail } from '$lib/server/email';
import { rateLimit } from '$lib/server/rate-limit';
import type { Actions } from './$types';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_SUBJECT = 200;
const MAX_MESSAGE = 5000;
const WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_IP = 5;

export const actions: Actions = {
	default: async (event) => {
		const data = await event.request.formData();
		const email = data.get('email')?.toString().trim() ?? '';
		const subject = data.get('subject')?.toString().trim() ?? '';
		const message = data.get('message')?.toString().trim() ?? '';

		const limit = rateLimit(`contact:ip:${event.getClientAddress()}`, MAX_PER_IP, WINDOW_MS);
		if (!limit.ok) {
			return fail(429, {
				email,
				subject,
				message,
				error: 'Too many messages. Please try again in a little while.'
			});
		}

		if (!emailPattern.test(email) || !subject || !message) {
			return fail(400, {
				email,
				subject,
				message,
				error: 'Please fill out every field with a valid email.'
			});
		}
		if (subject.length > MAX_SUBJECT || message.length > MAX_MESSAGE) {
			return fail(400, {
				email,
				subject,
				message,
				error: `Keep the subject under ${MAX_SUBJECT} and the message under ${MAX_MESSAGE} characters.`
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
