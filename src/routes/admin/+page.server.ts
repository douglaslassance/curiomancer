import { sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const stats = await db.execute<{
		users: number;
		admins: number;
		places: number;
		places_apple: number;
		places_manual: number;
		places_seed: number;
		liked: number;
		disliked: number;
		seen: number;
		want_to_go: number;
		invites_total: number;
		invites_redeemed: number;
	}>(sql`
		SELECT
			(SELECT COUNT(*)::int FROM "user" WHERE email NOT LIKE '%@demo.bond') AS users,
			(SELECT COUNT(*)::int FROM "user" WHERE role = 'admin') AS admins,
			(SELECT COUNT(*)::int FROM place) AS places,
			(SELECT COUNT(*)::int FROM place WHERE source = 'apple') AS places_apple,
			(SELECT COUNT(*)::int FROM place WHERE source = 'manual') AS places_manual,
			(SELECT COUNT(*)::int FROM place WHERE source = 'seed') AS places_seed,
			(SELECT COUNT(*)::int FROM place_relation WHERE kind = 'liked') AS liked,
			(SELECT COUNT(*)::int FROM place_relation WHERE kind = 'disliked') AS disliked,
			(SELECT COUNT(*)::int FROM place_relation WHERE kind = 'seen') AS seen,
			(SELECT COUNT(*)::int FROM place_relation WHERE kind = 'want_to_go') AS want_to_go,
			(SELECT COUNT(*)::int FROM "invite") AS invites_total,
			(SELECT COUNT(*)::int FROM "invite" WHERE redeemed_by_user_id IS NOT NULL) AS invites_redeemed
	`);

	return { stats: stats[0] };
};
