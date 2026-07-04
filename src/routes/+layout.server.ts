import { getPlaceIdsByKind } from '$lib/server/likes';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	const user = locals.user ?? null;
	const impersonating = !!locals.session?.impersonatedBy;
	if (!user) {
		return {
			user: null,
			impersonating,
			likedIds: [] as string[],
			dislikedIds: [] as string[],
			seenIds: [] as string[],
			wantToGoIds: [] as string[]
		};
	}
	const [liked, disliked, seen, wantToGo] = await Promise.all([
		getPlaceIdsByKind(user.id, 'liked'),
		getPlaceIdsByKind(user.id, 'disliked'),
		getPlaceIdsByKind(user.id, 'seen'),
		getPlaceIdsByKind(user.id, 'want_to_go')
	]);
	return {
		user,
		impersonating,
		likedIds: [...liked],
		dislikedIds: [...disliked],
		seenIds: [...seen],
		wantToGoIds: [...wantToGo]
	};
};
