/**
 * Admin identity helper.
 *
 * The first admin is bootstrapped via /setup, which is only available
 * when the database has zero users. After that, promotions happen via
 * the admin panel.
 */

export type UserLike = { role?: string | null } | undefined | null;

export function isAdmin(u: UserLike): boolean {
	return u?.role === 'admin';
}
