import { db } from './db';
import { waitlist } from './db/schema';

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

	await db
		.insert(waitlist)
		.values({ email, city })
		.onConflictDoUpdate({ target: waitlist.email, set: { city } });

	return { ok: true, email };
}
