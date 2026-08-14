import { sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { AGREEMENT_EXPR, matchScoreExpr } from '$lib/server/similarity';
import type { PageServerLoad } from './$types';

export type AdminUserRow = {
	id: string;
	name: string;
	email: string;
	role: 'user' | 'admin';
	createdAt: Date;
	city: string | null;
	likes: number;
	/**
	 * Signed taste similarity with the admin viewing the list, -1..+1, or null
	 * when there's nothing to compare (the viewer's own row, no overlapping
	 * opinions, or either side has no liked/disliked signal).
	 */
	matchScore: number | null;
	/** How many places the viewer and this user overlap on. */
	sharedCount: number;
	/** 'free' (no active sub), 'active' (paid), or 'granted' (admin comp). */
	subscriptionStatus: 'free' | 'active' | 'granted';
};

export const load: PageServerLoad = async ({ locals }) => {
	// The admin layout guarantees a signed-in admin, so the viewer is always set.
	const viewerId = locals.user!.id;

	const rows = await db.execute<{
		id: string;
		name: string;
		email: string;
		role: 'user' | 'admin';
		created_at: Date;
		city: string | null;
		likes: number;
		match_score: number | null;
		shared_count: number | null;
		subscription_status: 'active' | 'granted' | null;
	}>(sql`
		WITH my_relations AS (
			SELECT place_id, kind FROM "place_relation"
			WHERE user_id = ${viewerId} AND kind IN ('liked', 'disliked')
		),
		my_total AS (SELECT COUNT(*)::float AS n FROM my_relations),
		their_totals AS (
			SELECT user_id, COUNT(*)::float AS n
			FROM "place_relation"
			WHERE kind IN ('liked', 'disliked')
			GROUP BY user_id
		),
		pair_stats AS (
			SELECT
				theirs.user_id,
				COUNT(*)::int AS shared_count,
				SUM(${AGREEMENT_EXPR})::float AS agreement_sum
			FROM "place_relation" theirs
			JOIN my_relations mine ON mine.place_id = theirs.place_id
			WHERE theirs.user_id <> ${viewerId}
			  AND theirs.kind IN ('liked', 'disliked')
			GROUP BY theirs.user_id
		)
		SELECT
			u.id,
			u.name,
			u.email,
			COALESCE(u.role, 'user') AS role,
			u.created_at,
			ul.city,
			(SELECT COUNT(*)::int FROM place_relation WHERE user_id = u.id AND kind = 'liked') AS likes,
			ps.shared_count,
			${matchScoreExpr(
				sql`ps.agreement_sum`,
				sql`ps.shared_count`,
				sql`(SELECT n FROM my_total)`,
				sql`tt.n`
			)} AS match_score,
			(SELECT CASE WHEN s.stripe_customer_id IS NULL THEN 'granted' ELSE 'active' END
			 FROM subscription s WHERE s.user_id = u.id AND s.status = 'active'
			 ORDER BY s.created_at DESC LIMIT 1) AS subscription_status
		FROM "user" u
		LEFT JOIN user_location ul ON ul.user_id = u.id
		LEFT JOIN pair_stats ps ON ps.user_id = u.id
		LEFT JOIN their_totals tt ON tt.user_id = u.id
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
		matchScore: r.match_score === null ? null : Number(r.match_score),
		sharedCount: r.shared_count ?? 0,
		subscriptionStatus: r.subscription_status ?? 'free'
	}));

	return { users };
};
