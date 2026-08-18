import { sql } from 'drizzle-orm';
import { db } from './db';
import { waitlist } from './db/schema';
import { geocodeApple } from './maps-search';

export type WaitlistResult = { ok: true; email: string } | { ok: false; message: string };

/**
 * Validate and upsert a waitlist entry (email + city). Shared by the public
 * splash signup (/api/waitlist) and the admin "add by hand" form so both
 * enforce the same rules. Re-adding an existing email just updates its city.
 */
export async function joinWaitlist(emailRaw: unknown, cityRaw: unknown): Promise<WaitlistResult> {
	const email = typeof emailRaw === 'string' ? emailRaw.trim().toLowerCase() : '';
	if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
		return { ok: false, message: 'Enter a valid email address.' };
	}

	const city = typeof cityRaw === 'string' ? cityRaw.trim() : '';
	if (!city) return { ok: false, message: 'Tell us your city.' };

	// Best-effort: the join map is a nice-to-have, so a geocoding hiccup
	// shouldn't block the signup - the row just lands with null coordinates.
	let coords: { latitude: number; longitude: number } | null = null;
	try {
		coords = await geocodeApple(city);
	} catch (err) {
		console.error('Waitlist geocode failed:', err);
	}

	await db
		.insert(waitlist)
		.values({ email, city, latitude: coords?.latitude, longitude: coords?.longitude })
		.onConflictDoUpdate({
			target: waitlist.email,
			set: { city, latitude: coords?.latitude, longitude: coords?.longitude }
		});

	return { ok: true, email };
}

export type WaitlistStats = { total: number; cities: { city: string; count: number }[] };

/**
 * Total waitlist size plus signups grouped by city, ranked. Answers "where is
 * demand coming from" without asking anyone to compare circles on a map.
 */
export async function getWaitlistStats(): Promise<WaitlistStats> {
	// By city, matching the user stats. Waitlist rows carry no country code, only
	// the city someone typed, so there is nothing coarser to roll up to.
	const [[{ count: total }], cities] = await Promise.all([
		db.select({ count: sql<number>`count(*)::int` }).from(waitlist),
		db
			// The where-clause below rules out null/empty, which drizzle cannot infer.
			.select({ city: sql<string>`${waitlist.city}`, count: sql<number>`count(*)::int` })
			.from(waitlist)
			.where(sql`${waitlist.city} is not null and ${waitlist.city} <> ''`)
			.groupBy(waitlist.city)
			.orderBy(sql`count(*) desc, ${waitlist.city} asc`)
	]);

	return { total, cities };
}
