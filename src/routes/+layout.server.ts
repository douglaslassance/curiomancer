import { getPlaceIdsByKind } from '$lib/server/likes';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	const user = locals.user ?? null;
	if (!user) {
		return {
			user: null,
			likedIds: [] as string[],
			dislikedIds: [] as string[],
			seenIds: [] as string[]
		};
	}
	const [liked, disliked, seen] = await Promise.all([
		getPlaceIdsByKind(user.id, 'liked'),
		getPlaceIdsByKind(user.id, 'disliked'),
		getPlaceIdsByKind(user.id, 'seen')
	]);
	return {
		user,
		likedIds: [...liked],
		dislikedIds: [...disliked],
		seenIds: [...seen]
	};
};
