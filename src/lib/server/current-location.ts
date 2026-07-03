import { eq } from 'drizzle-orm';
import { db } from './db';
import { userLocation } from './db/schema';

export type CurrentLocation = {
	latitude: number;
	longitude: number;
	city: string;
	countryCode: string | null;
	timezone: string | null;
};

/**
 * The user's current location row, or null if they have not set one yet.
 * The page loads inline this query; the /api/v1 routes share it here.
 */
export async function getUserLocation(userId: string): Promise<CurrentLocation | null> {
	const [loc] = await db
		.select({
			latitude: userLocation.latitude,
			longitude: userLocation.longitude,
			city: userLocation.city,
			countryCode: userLocation.countryCode,
			timezone: userLocation.timezone
		})
		.from(userLocation)
		.where(eq(userLocation.userId, userId))
		.limit(1);
	return loc ?? null;
}
