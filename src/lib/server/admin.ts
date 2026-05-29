/**
 * Admin identity helpers.
 *
 * `ADMIN_EMAILS` is a comma-separated list of email addresses that get
 * `role='admin'` set automatically at signup. This bootstraps the system:
 * the very first admin can never be promoted by anyone else, so they have
 * to come in through a config flag. After that, future admin promotions
 * can happen through the admin panel.
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

export function isAdmin(user: UserLike): boolean {
	return user?.role === 'admin';
}
