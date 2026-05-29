import { redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { placeRelation, userLocation } from '$lib/server/db/schema';
import { getInvitesFor } from '$lib/server/invites';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(302, '/sign-in?next=/settings');

	const [[location], likes, invites] = await Promise.all([
		db.select().from(userLocation).where(eq(userLocation.userId, locals.user.id)).limit(1),
		db
			.select({ id: placeRelation.id })
			.from(placeRelation)
			.where(eq(placeRelation.userId, locals.user.id)),
		getInvitesFor(locals.user.id)
	]);

	return {
		profile: {
			name: locals.user.name,
			email: locals.user.email,
			image: locals.user.image ?? null,
			role: (locals.user as { role?: string }).role ?? 'user'
		},
		location: location ?? null,
		likeCount: likes.length,
		invites
	};
};
