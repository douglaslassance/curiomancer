import { fail } from '@sveltejs/kit';
import { sendEmail } from '$lib/server/email';
import type { Actions } from './$types';

// Temporary: routing to a personal inbox until the curiomancer.me email
// domain is set up. Swap back to hey@curiomancer.me once it is.
const CONTACT_TO = 'hey@douglaslassance.me';
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const actions: Actions = {
	default: async ({ request }) => {
		const data = await request.formData();
		const email = data.get('email')?.toString().trim() ?? '';
		const subject = data.get('subject')?.toString().trim() ?? '';
		const message = data.get('message')?.toString().trim() ?? '';
		// Honeypot: real users never see or fill this. Bots that do get a fake
		// success so they stop retrying, and nothing is sent.
		const honeypot = data.get('company')?.toString().trim() ?? '';
		if (honeypot) return { sent: true };

		const values = { email, subject, message };
		if (!emailPattern.test(email)) {
			return fail(400, { ...values, error: 'Enter a valid email address.' });
		}
		if (!subject) return fail(400, { ...values, error: 'Add a subject.' });
		if (!message) return fail(400, { ...values, error: 'Add a message.' });

		try {
			await sendEmail({
				to: CONTACT_TO,
				subject: `[Curiomancer] ${subject}`,
				text: `From: ${email}\n\n${message}`,
				replyTo: email
			});
		} catch (err) {
			console.error('Contact form send failed:', err);
			return fail(500, {
				...values,
				error: 'Something went wrong sending your message. Please try again.'
			});
		}

		return { sent: true };
	}
};
