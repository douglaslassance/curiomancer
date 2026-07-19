import { sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import type { PageServerLoad } from './$types';

export type AdminUserRow = {
	id: string;
	name: string;
	email: string;
	role: 'user' | 'admin';
	createdAt: Date;
	city: string | null;
	likes: number;
	/** 'free' (no active sub), 'active' (paid), or 'granted' (admin comp). */
	subscriptionStatus: 'free' | 'active' | 'granted';
};

export const load: PageServerLoad = async () => {
	const rows = await db.execute<{
		id: string;
		name: string;
		email: string;
		role: 'user' | 'admin';
		created_at: Date;
		city: string | null;
		likes: number;
		subscription_status: 'active' | 'granted' | null;
	}>(sql`
		SELECT
			u.id,
			u.name,
			u.email,
			COALESCE(u.role, 'user') AS role,
			u.created_at,
			ul.city,
			(SELECT COUNT(*)::int FROM place_relation WHERE user_id = u.id AND kind = 'liked') AS likes,
			(SELECT CASE WHEN s.stripe_customer_id IS NULL THEN 'granted' ELSE 'active' END
			 FROM subscription s WHERE s.user_id = u.id AND s.status = 'active'
			 ORDER BY s.created_at DESC LIMIT 1) AS subscription_status
		FROM "user" u
		LEFT JOIN user_location ul ON ul.user_id = u.id
		ORDER BY u.created_at DESC
	`);

	const users: AdminUserRow[] = rows.map((r) => ({
		id: r.id,
		name: r.name,
		email: r.email,
		role: r.role,
		createdAt: new Date(r.created_at),
		city: r.city,
		likes: r.likes,
		subscriptionStatus: r.subscription_status ?? 'free'
	}));

	return { users };
};
