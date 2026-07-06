import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAvatarObject } from '$lib/server/storage';

// uuid.ext, matching the filenames storage.ts generates. Rejecting anything
// else up front means a malformed request never reaches R2 or local disk.
const FILENAME_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|jpeg|webp|gif)$/;

export const GET: RequestHandler = async ({ params }) => {
	if (!FILENAME_PATTERN.test(params.filename)) error(404, 'Not found');

	const object = await getAvatarObject(params.filename);
	if (!object) error(404, 'Not found');

	// Filenames are random UUIDs and never reused, so the same URL always
	// resolves to the same bytes - safe to cache forever.
	return new Response(object.body as BodyInit, {
		headers: {
			'Content-Type': object.contentType,
			'Cache-Control': 'public, max-age=31536000, immutable'
		}
	});
};
