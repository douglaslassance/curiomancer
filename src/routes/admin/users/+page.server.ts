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
	dislikes: number;
	invitesRemaining: number;
	referredByName: string | null;
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
		dislikes: number;
		invites_remaining: number;
		referred_by_name: string | null;
	}>(sql`
		SELECT
			u.id,
			u.name,
			u.email,
			COALESCE(u.role, 'user') AS role,
			u.created_at,
			ul.city,
			(SELECT COUNT(*)::int FROM place_relation WHERE user_id = u.id AND kind = 'liked') AS likes,
			(SELECT COUNT(*)::int FROM place_relation WHERE user_id = u.id AND kind = 'disliked') AS dislikes,
			(SELECT COUNT(*)::int FROM "invite" WHERE created_by_user_id = u.id AND redeemed_by_user_id IS NULL) AS invites_remaining,
			(SELECT inviter.name FROM "invite" i JOIN "user" inviter ON inviter.id = i.created_by_user_id WHERE i.redeemed_by_user_id = u.id LIMIT 1) AS referred_by_name
		FROM "user" u
		LEFT JOIN user_location ul ON ul.user_id = u.id
		ORDER BY u.created_at DESC
	`);

	const users: AdminUserRow[] = rows.map((r) => ({
		id: r.id,
		name: r.name,
		email: r.email,
		role: r.role,
		createdAt: r.created_at,
		city: r.city,
		likes: r.likes,
		dislikes: r.dislikes,
		invitesRemaining: r.invites_remaining,
		referredByName: r.referred_by_name
	}));

	return { users };
};
