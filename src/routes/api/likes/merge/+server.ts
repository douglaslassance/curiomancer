import { error, json } from '@sveltejs/kit';
import { mergeLikes } from '$lib/server/likes';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) throw error(401);

	const { placeIds } = (await request.json()) as { placeIds?: string[] };
	if (!Array.isArray(placeIds)) throw error(400, 'placeIds must be an array.');

	const inserted = await mergeLikes(locals.user.id, placeIds);
	return json({ inserted });
};
