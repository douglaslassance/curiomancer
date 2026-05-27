import { getPlaceIdsByKind } from '$lib/server/likes';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	const user = locals.user ?? null;
	if (!user) {
		return { user: null, likedIds: [] as string[], dislikedIds: [] as string[] };
	}
	const [liked, disliked] = await Promise.all([
		getPlaceIdsByKind(user.id, 'liked'),
		getPlaceIdsByKind(user.id, 'disliked')
	]);
	return {
		user,
		likedIds: [...liked],
		dislikedIds: [...disliked]
	};
};
