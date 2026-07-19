import { error } from '@sveltejs/kit';
import { getRatingsForExport } from '$lib/server/likes';
import type { RequestHandler } from './$types';

/**
 * Download the user's ratings as JSON. The `attachment` header makes the
 * browser save it; the native import (/import/native) reads this same shape
 * back.
 */
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) throw error(401, 'Sign in to export your ratings.');

	const ratings = await getRatingsForExport(locals.user.id);
	const payload = {
		format: 'curiomancer-ratings',
		version: 1,
		exportedAt: new Date().toISOString(),
		ratings
	};

	return new Response(JSON.stringify(payload, null, 2), {
		headers: {
			'content-type': 'application/json; charset=utf-8',
			'content-disposition': 'attachment; filename="curiomancer-ratings.json"'
		}
	});
};
