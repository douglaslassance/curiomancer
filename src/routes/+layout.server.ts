import { getLikedPlaceIds } from '$lib/server/likes';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	const user = locals.user ?? null;
	const likedIds = user ? [...(await getLikedPlaceIds(user.id))] : [];
	return { user, likedIds };
};
