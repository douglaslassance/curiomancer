/**
 * Transactional email.
 *
 * Delivery goes through Cloudflare Email Service when CLOUDFLARE_API_TOKEN and
 * CLOUDFLARE_ACCOUNT_ID are set; otherwise emails are logged to the server
 * console, which is fine for local/test builds where you grab the link
 * straight from the logs. Every caller goes through `sendEmail`, so that's
 * the only place provider details live.
 *
 * Env:
 * - CLOUDFLARE_API_TOKEN: API token with Email Sending: Edit permission.
 * - CLOUDFLARE_ACCOUNT_ID: account the sending domain is onboarded under.
 * - EMAIL_FROM: verified sender, e.g. "Curiomancer <no-reply@mail.curiomancer.com>".
 */
import { env } from '$env/dynamic/private';

type Email = { to: string; subject: string; text: string; html: string };

type CloudflareEmailResponse = {
	success: boolean;
	errors: { code: number; message: string }[];
};

export async function sendEmail({ to, subject, text, html }: Email): Promise<void> {
	if (env.CLOUDFLARE_API_TOKEN && env.CLOUDFLARE_ACCOUNT_ID) {
		const response = await fetch(
			`https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/email/sending/send`,
			{
				method: 'POST',
				headers: {
					Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					from: env.EMAIL_FROM || 'Curiomancer <no-reply@mail.curiomancer.com>',
					to,
					subject,
					text,
					html
				})
			}
		);
		const result = (await response.json()) as CloudflareEmailResponse;
		if (!result.success) {
			const message = result.errors.map((e) => e.message).join(', ') || response.statusText;
			throw new Error(`Cloudflare Email delivery failed: ${message}`);
		}
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

/** Brand colors pulled from src/routes/layout.css, as hex since email clients don't support oklch(). */
const BRAND_PRIMARY = '#236d4d';
const BRAND_FOREGROUND = '#0a0a0a';
const BRAND_MUTED = '#737373';
const BRAND_CANVAS = '#f4f4f5';
const FONT_STACK = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/**
 * Shared layout for transactional emails: a centered card with the
 * Curiomancer wordmark, a heading, body paragraphs, and an optional CTA
 * button. Styles are inlined throughout since most email clients strip
 * `<style>` blocks.
 */
function renderEmailHtml({
	heading,
	paragraphs,
	action
}: {
	heading: string;
	paragraphs: string[];
	action?: { label: string; url: string };
}): string {
	const paragraphsHtml = paragraphs
		.map(
			(paragraph) =>
				`<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${BRAND_FOREGROUND};">${paragraph}</p>`
		)
		.join('');

	const actionHtml = action
		? `
					<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px;">
						<tr>
							<td style="border-radius:8px;background-color:${BRAND_PRIMARY};">
								<a href="${action.url}" style="display:inline-block;padding:12px 24px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">${action.label}</a>
							</td>
						</tr>
					</table>
					<p style="margin:0;font-size:13px;line-height:1.6;color:${BRAND_MUTED};word-break:break-all;">
						Or paste this link into your browser:<br />
						<a href="${action.url}" style="color:${BRAND_PRIMARY};">${action.url}</a>
					</p>`
		: '';

	return `<!DOCTYPE html>
<html>
	<body style="margin:0;padding:32px 16px;background-color:${BRAND_CANVAS};font-family:${FONT_STACK};">
		<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:480px;margin:0 auto;background-color:#ffffff;border-radius:12px;">
			<tr>
				<td style="padding:32px;">
					<p style="margin:0 0 24px;font-size:16px;font-weight:700;color:${BRAND_PRIMARY};">Curiomancer</p>
					<h1 style="margin:0 0 16px;font-size:20px;line-height:1.4;color:${BRAND_FOREGROUND};">${heading}</h1>
					${paragraphsHtml}${actionHtml}
				</td>
			</tr>
		</table>
	</body>
</html>`;
}

/** Password-reset email. `resetUrl` already carries the one-time token. */
export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
	await sendEmail({
		to,
		subject: 'Reset your Curiomancer password',
		text:
			'Someone requested a password reset for your Curiomancer account.\n\n' +
			`Reset it here (the link expires in 1 hour):\n${resetUrl}\n\n` +
			"If this wasn't you, you can safely ignore this email.",
		html: renderEmailHtml({
			heading: 'Reset your password',
			paragraphs: [
				'Someone requested a password reset for your Curiomancer account.',
				"If this wasn't you, you can safely ignore this email."
			],
			action: { label: 'Reset password', url: resetUrl }
		})
	});
}

/** Sent when someone joins the waitlist through the public splash form. */
export async function sendWaitlistConfirmationEmail(to: string): Promise<void> {
	await sendEmail({
		to,
		subject: "You're on the Curiomancer waitlist",
		text:
			"You're on the list. We admit people in waves, so hang tight - " +
			"we'll email you an invite as soon as there's room.",
		html: renderEmailHtml({
			heading: "You're on the list",
			paragraphs: [
				"You're on the Curiomancer waitlist. We admit people in waves, so hang tight, " +
					"we'll email you an invite as soon as there's room."
			]
		})
	});
}

/** Sent when an admin admits a waitlist entry. `inviteUrl` carries the invite code. */
export async function sendInviteEmail(to: string, inviteUrl: string): Promise<void> {
	await sendEmail({
		to,
		subject: "You're invited to Curiomancer",
		text:
			"Good news - you're off the waitlist and invited to join Curiomancer.\n\n" +
			`Create your account here:\n${inviteUrl}`,
		html: renderEmailHtml({
			heading: "You're invited",
			paragraphs: ["Good news, you're off the waitlist and invited to join Curiomancer."],
			action: { label: 'Create your account', url: inviteUrl }
		})
	});
}
