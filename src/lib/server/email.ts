/**
 * Transactional email.
 *
 * Delivery is intentionally pluggable. No provider is wired yet, so emails are
 * logged to the server console - fine for local/test builds where you grab the
 * link straight from the logs. To send real email, fill in the provider branch
 * in `sendEmail` (e.g. Resend); every caller already goes through it, so that's
 * the only place that changes.
 */
type Email = { to: string; subject: string; text: string };

export async function sendEmail({ to, subject, text }: Email): Promise<void> {
	// To go live, add a provider here, e.g.:
	//   if (env.RESEND_API_KEY) { await resend.emails.send({ ... }); return; }
	console.log(
		[
			'',
			'[email] no provider configured - logging instead of sending',
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
