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
	isSubscriber: boolean;
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
		is_subscriber: boolean;
	}>(sql`
		SELECT
			u.id,
			u.name,
			u.email,
			COALESCE(u.role, 'user') AS role,
			u.created_at,
			ul.city,
			(SELECT COUNT(*)::int FROM place_relation WHERE user_id = u.id AND kind = 'liked') AS likes,
			EXISTS (SELECT 1 FROM subscription s WHERE s.user_id = u.id AND s.status = 'active') AS is_subscriber
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
		isSubscriber: r.is_subscriber
	}));

	return { users };
};
