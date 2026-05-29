/**
 * Admin identity helpers.
 *
 * `ADMIN_EMAILS` is a comma-separated list of email addresses that get
 * `role='admin'` auto-promoted via the better-auth user.create hook. It
 * doesn't bypass the invite gate at /sign-up — those listed emails still
 * need a code. (Their account just lands with admin rights.)
 *
 * The first admin enters the system via /setup, which is only available
 * when the database has zero users. After that, promotions happen via
 * the admin panel or by adding emails to ADMIN_EMAILS before signup.
 */

function adminEmailSet(): Set<string> {
	const raw = process.env.ADMIN_EMAILS ?? '';
	return new Set(
		raw
			.split(',')
			.map((s) => s.trim().toLowerCase())
			.filter(Boolean)
	);
}

export function isAdminEmail(email: string | undefined | null): boolean {
	if (!email) return false;
	return adminEmailSet().has(email.toLowerCase());
}

export type UserLike = { role?: string | null } | undefined | null;

export function isAdmin(u: UserLike): boolean {
	return u?.role === 'admin';
}
