import { error, json } from '@sveltejs/kit';
import { recordTuneSkip } from '$lib/server/tune';
import type { RequestHandler } from './$types';

/**
 * Record a Tune "skip" - a pass with no rating - so the place backs off in the
 * queue (hidden for a cooldown, then resurfaces; retired after enough skips).
 *
 *   body: { placeId: string } for a saved place, or
 *         { externalId: string } for a raw Apple POI not yet in our DB.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) throw error(401, 'Sign in to skip places.');
	const body = (await request.json().catch(() => null)) as {
		placeId?: unknown;
		externalId?: unknown;
	} | null;
	const placeId = typeof body?.placeId === 'string' ? body.placeId : undefined;
	const externalId = typeof body?.externalId === 'string' ? body.externalId : undefined;
	if (!placeId && !externalId) throw error(400, 'placeId or externalId required.');
	await recordTuneSkip(locals.user.id, { placeId, externalId });
	return json({ ok: true });
};
