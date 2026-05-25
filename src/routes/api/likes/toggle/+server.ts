import { error, json } from '@sveltejs/kit';
import { toggleLike } from '$lib/server/likes';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) throw error(401, 'Sign in to like places.');

	const form = await request.formData();
	const placeId = form.get('placeId')?.toString();
	if (!placeId) throw error(400, 'placeId required.');

	const liked = await toggleLike(locals.user.id, placeId);
	return json({ placeId, liked });
};
