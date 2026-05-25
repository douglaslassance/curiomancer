import { redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { like, userLocation } from '$lib/server/db/schema';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(302, '/sign-in?next=/settings');

	const [location] = await db
		.select()
		.from(userLocation)
		.where(eq(userLocation.userId, locals.user.id))
		.limit(1);

	const likeCount = (
		await db.select({ id: like.id }).from(like).where(eq(like.userId, locals.user.id))
	).length;

	return {
		profile: {
			name: locals.user.name,
			email: locals.user.email,
			image: locals.user.image ?? null
		},
		location: location ?? null,
		likeCount
	};
};
