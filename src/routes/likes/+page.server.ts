import { db } from '$lib/server/db';
import { place } from '$lib/server/db/schema';
import { asc } from 'drizzle-orm';

/**
 * Load all places so the client can filter to liked IDs from localStorage.
 * Fine for v0; once likes live in the DB we'll filter server-side.
 */
export const load = async () => {
	const places = await db.select().from(place).orderBy(asc(place.city), asc(place.name));
	return { places };
};
