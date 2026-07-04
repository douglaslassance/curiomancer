/**
 * Transactional email.
 *
 * Delivery goes through Resend when RESEND_API_KEY is set; otherwise emails are
 * logged to the server console, which is fine for local/test builds where you
 * grab the link straight from the logs. Every caller goes through `sendEmail`,
 * so that's the only place provider details live.
 *
 * Env:
 * - RESEND_API_KEY: enables real delivery. When absent, falls back to console.
 * - EMAIL_FROM: verified sender, e.g. "Curiomancer <no-reply@mail.curiomancer.com>".
 */
import { env } from '$env/dynamic/private';
import { Resend } from 'resend';

type Email = { to: string; subject: string; text: string };

export async function sendEmail({ to, subject, text }: Email): Promise<void> {
	if (env.RESEND_API_KEY) {
		const resend = new Resend(env.RESEND_API_KEY);
		const { error } = await resend.emails.send({
			from: env.EMAIL_FROM || 'Curiomancer <onboarding@resend.dev>',
			to,
			subject,
			text
		});
		if (error) throw new Error(`Resend delivery failed: ${error.message}`);
		return;
	}

	console.log(
		[
			'',
			'[email] no provider configured, logging instead of sending',
			`  to:      ${to}`,
			`  subject: ${subject}`,
			...text.split('\n').map((line) => `  ${line}`),
			''
		].join('\n')
	);
}

/** Password-reset email. `resetUrl` already carries the one-time token. */
export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
	await sendEmail({
		to,
		subject: 'Reset your Curiomancer password',
		text:
			'Someone requested a password reset for your Curiomancer account.\n\n' +
			`Reset it here (the link expires in 1 hour):\n${resetUrl}\n\n` +
			"If this wasn't you, you can safely ignore this email."
	});
}
