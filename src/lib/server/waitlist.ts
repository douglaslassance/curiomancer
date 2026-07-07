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

export type WaitlistLocation = { latitude: number; longitude: number; count: number };

export type WaitlistStats = { total: number; locations: WaitlistLocation[] };

/**
 * Total waitlist size plus a bubble-map dataset: coordinates rounded to ~1km
 * (3 decimal places) and grouped, so nearby geocodes of the same city collapse
 * into one bubble instead of a cluster of overlapping ones.
 */
export async function getWaitlistStats(): Promise<WaitlistStats> {
	// `numeric` comes back from postgres.js as a string, so round through it
	// for precision and cast back to `double precision` for a real JS number.
	const roundedLat = sql<number>`round(${waitlist.latitude}::numeric, 3)::double precision`;
	const roundedLng = sql<number>`round(${waitlist.longitude}::numeric, 3)::double precision`;

	const [[{ count: total }], locations] = await Promise.all([
		db.select({ count: sql<number>`count(*)::int` }).from(waitlist),
		db
			.select({
				latitude: roundedLat,
				longitude: roundedLng,
				count: sql<number>`count(*)::int`
			})
			.from(waitlist)
			.where(sql`${waitlist.latitude} is not null and ${waitlist.longitude} is not null`)
			.groupBy(roundedLat, roundedLng)
	]);

	return { total, locations };
}
