/**
 * Admin identity + bootstrap helpers.
 *
 * Two complementary mechanisms decide who becomes an admin:
 *
 * 1. `ADMIN_EMAILS` env var — a comma-separated list of email addresses
 *    that are auto-promoted to `role='admin'` at signup. Useful when you
 *    know your email up-front and want declarative configuration.
 *
 * 2. First-run bootstrap — if no admin user exists in the database, the
 *    next signup becomes the first admin (and the invite gate is lifted
 *    for that one signup). Lets a fresh deploy be claimed by visiting
 *    `/sign-up` without any env-var fiddling.
 *
 * If `ADMIN_EMAILS` is set, bootstrap is restricted to emails on that
 * list. That gives the cautious operator a way to close the "anyone-who-
 * hits-sign-up-first-wins" window while still using the bootstrap flow.
 */
import { count, eq } from 'drizzle-orm';
import { db } from './db';
import { user } from './db/schema';

/** True iff at least one admin user exists in the database. */
export async function hasAnyAdmin(): Promise<boolean> {
	const [{ n }] = await db.select({ n: count() }).from(user).where(eq(user.role, 'admin'));
	return n > 0;
}

/**
 * Whether `email` is eligible to claim first-admin via the bootstrap. If
 * ADMIN_EMAILS isn't configured, anyone can. If it is, the email must
 * match a listed entry.
 */
export function canBootstrapAs(email: string): boolean {
	const set = adminEmailSet();
	if (set.size === 0) return true;
	return set.has(email.toLowerCase());
}

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
