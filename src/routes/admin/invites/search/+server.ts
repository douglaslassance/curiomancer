import { json } from '@sveltejs/kit';
import { asc, ilike, or } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { user } from '$lib/server/db/schema';
import type { RequestHandler } from './$types';

// Search users by name or email for the invite owner picker. The /admin area is
// admin-gated centrally in hooks.server.ts, so no extra guard is needed here.
export const GET: RequestHandler = async ({ url }) => {
	const q = (url.searchParams.get('q') ?? '').trim();
	if (!q) return json({ users: [] });

	const like = `%${q}%`;
	const users = await db
		.select({ id: user.id, name: user.name, email: user.email })
		.from(user)
		.where(or(ilike(user.name, like), ilike(user.email, like)))
		.orderBy(asc(user.name))
		.limit(20);

	return json({ users });
};
