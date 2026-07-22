import { buildHome } from '$lib/server/home';
import { isMobileUserAgent } from '$lib/server/user-agent';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, request }) => {
	if (!locals.user) {
		return { signedIn: false as const };
	}

	// The Google Maps import isn't practical on a phone, so the cold-start import
	// banner is hidden there (see the home page); mobile users are nudged to Tune.
	const isMobile = isMobileUserAgent(request.headers.get('user-agent'));

	const home = await buildHome(locals.user.id);
	if (!home.location) {
		return { signedIn: true as const, location: null };
	}

	return { signedIn: true as const, isMobile, ...home };
};
