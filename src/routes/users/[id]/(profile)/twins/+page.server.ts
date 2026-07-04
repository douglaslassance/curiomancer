import { getMatchedPeopleInCity, getSharedTwins } from '$lib/server/matching';
import type { PageServerLoad } from './$types';

/**
 * Taste-twins shown here depend on who's looking:
 *  - Someone else's profile: twins shared between the viewer and the
 *    profile owner - "the twins we both share," not either person's twins
 *    in general.
 *  - Your own profile: your own twins (there's no "other party" to share
 *    with), city-scoped like the home dashboard's matched-people rail.
 *  - Anonymous: nothing to compare, so nothing to show.
 */
export const load: PageServerLoad = async ({ parent, locals }) => {
	const { profile, location, viewer } = await parent();

	if (!viewer) return { twins: [] };

	if (!viewer.isSelf && locals.user) {
		const twins = await getSharedTwins(locals.user.id, profile.id);
		return { twins };
	}

	if (!location) return { twins: [] };
	const twins = await getMatchedPeopleInCity(profile.id, location.city);
	return { twins };
};
