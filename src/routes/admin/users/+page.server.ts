import { fail, redirect } from '@sveltejs/kit';
import { sql } from 'drizzle-orm';
import { dev } from '$app/environment';
import { db } from '$lib/server/db';
import { auth } from '$lib/server/auth';
import type { Actions, PageServerLoad } from './$types';

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
		createdAt: new Date(r.created_at),
		city: r.city,
		likes: r.likes,
		dislikes: r.dislikes,
		invitesRemaining: r.invites_remaining,
		referredByName: r.referred_by_name
	}));

	// Impersonation is a real auth-bypass, so the button only renders (and the
	// action only runs) in dev - never in a deployed build.
	return { users, canImpersonate: dev };
};

export const actions: Actions = {
	impersonate: async ({ request, locals }) => {
		if (!dev) return fail(403, { message: 'Impersonation is only available in development.' });
		if (!locals.user) return fail(401, { message: 'Not signed in.' });

		const data = await request.formData();
		const userId = data.get('userId')?.toString() ?? '';
		if (!userId) return fail(400, { message: 'Missing user id.' });
		if (userId === locals.user.id) return fail(400, { message: "You can't impersonate yourself." });

		try {
			await auth.api.impersonateUser({ body: { userId }, headers: request.headers });
		} catch (err) {
			return fail(400, {
				message: err instanceof Error ? err.message : 'Could not impersonate that user.'
			});
		}
		throw redirect(303, '/');
	}
};
