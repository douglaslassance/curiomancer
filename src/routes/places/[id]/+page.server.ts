import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { place } from '$lib/server/db/schema';

export const load = async ({ params }) => {
	const [row] = await db.select().from(place).where(eq(place.id, params.id)).limit(1);
	if (!row) throw error(404, 'Place not found');
	return { place: row };
};
