import { error, fail, redirect } from '@sveltejs/kit';
import { sql } from 'drizzle-orm';
import { dev } from '$app/environment';
import { db } from '$lib/server/db';
import { auth } from '$lib/server/auth';
import { isAdmin } from '$lib/server/admin';
import { grantSubscription, revokeSubscription } from '$lib/server/subscriptions';
import type { Actions, PageServerLoad } from './$types';

export type AdminUserDetail = {
	id: string;
	name: string;
	email: string;
	image: string | null;
	role: 'user' | 'admin';
	createdAt: Date;
	city: string | null;
	countryCode: string | null;
	likes: number;
	dislikes: number;
	wantToGo: number;
	seen: number;
	invitesRemaining: number;
	invitesTotal: number;
	referredByName: string | null;
	isSubscriber: boolean;
};

export const load: PageServerLoad = async ({ params }) => {
	const [row] = await db.execute<{
		id: string;
		name: string;
		email: string;
		image: string | null;
		role: 'user' | 'admin';
		created_at: Date;
		city: string | null;
		country_code: string | null;
		likes: number;
		dislikes: number;
		want_to_go: number;
		seen: number;
		invites_remaining: number;
		invites_total: number;
		referred_by_name: string | null;
		is_subscriber: boolean;
	}>(sql`
		SELECT
			u.id,
			u.name,
			u.email,
			u.image,
			COALESCE(u.role, 'user') AS role,
			u.created_at,
			ul.city,
			ul.country_code,
			(SELECT COUNT(*)::int FROM place_relation WHERE user_id = u.id AND kind = 'liked') AS likes,
			(SELECT COUNT(*)::int FROM place_relation WHERE user_id = u.id AND kind = 'disliked') AS dislikes,
			(SELECT COUNT(*)::int FROM place_relation WHERE user_id = u.id AND kind = 'want_to_go') AS want_to_go,
			(SELECT COUNT(*)::int FROM place_relation WHERE user_id = u.id AND kind = 'seen') AS seen,
			(SELECT COUNT(*)::int FROM "invite" WHERE created_by_user_id = u.id AND redeemed_by_user_id IS NULL) AS invites_remaining,
			(SELECT COUNT(*)::int FROM "invite" WHERE created_by_user_id = u.id) AS invites_total,
			(SELECT inviter.name FROM "invite" i JOIN "user" inviter ON inviter.id = i.created_by_user_id WHERE i.redeemed_by_user_id = u.id LIMIT 1) AS referred_by_name,
			EXISTS (SELECT 1 FROM subscription s WHERE s.user_id = u.id AND s.status = 'active') AS is_subscriber
		FROM "user" u
		LEFT JOIN user_location ul ON ul.user_id = u.id
		WHERE u.id = ${params.id}
		LIMIT 1
	`);

	if (!row) throw error(404, 'User not found.');

	const user: AdminUserDetail = {
		id: row.id,
		name: row.name,
		email: row.email,
		image: row.image,
		role: row.role,
		createdAt: new Date(row.created_at),
		city: row.city,
		countryCode: row.country_code,
		likes: row.likes,
		dislikes: row.dislikes,
		wantToGo: row.want_to_go,
		seen: row.seen,
		invitesRemaining: row.invites_remaining,
		invitesTotal: row.invites_total,
		referredByName: row.referred_by_name,
		isSubscriber: row.is_subscriber
	};

	// Impersonation is a real auth-bypass, so it only renders (and runs) in dev.
	return { user, canImpersonate: dev };
};

export const actions: Actions = {
	impersonate: async ({ params, request, locals }) => {
		if (!dev) return fail(403, { message: 'Impersonation is only available in development.' });
		if (!isAdmin(locals.user)) return fail(403, { message: 'Admins only.' });
		if (params.id === locals.user.id) {
			return fail(400, { message: "You can't impersonate yourself." });
		}

		try {
			await auth.api.impersonateUser({ body: { userId: params.id }, headers: request.headers });
		} catch (err) {
			return fail(400, {
				message: err instanceof Error ? err.message : 'Could not impersonate that user.'
			});
		}
		throw redirect(303, '/');
	},

	grantSubscription: async ({ params, locals }) => {
		if (!isAdmin(locals.user)) return fail(403, { message: 'Admins only.' });
		await grantSubscription(params.id);
		return { granted: true };
	},

	revokeSubscription: async ({ params, locals }) => {
		if (!isAdmin(locals.user)) return fail(403, { message: 'Admins only.' });
		await revokeSubscription(params.id);
		return { revoked: true };
	}
};
