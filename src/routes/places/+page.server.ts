import { db } from '$lib/server/db';
import { place } from '$lib/server/db/schema';
import { asc } from 'drizzle-orm';

export const load = async () => {
	const places = await db.select().from(place).orderBy(asc(place.city), asc(place.name));
	return { places };
};
