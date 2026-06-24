import { error, json } from '@sveltejs/kit';
import { mintMapkitToken } from '$lib/server/mapkit';
import type { RequestHandler } from './$types';

/**
 * Returns a short-lived MapKit JS token bound to the request's origin.
 * The browser fetches this before initializing the map.
 */
export const GET: RequestHandler = async ({ url, locals }) => {
	// Open to anonymous users too - the marketing splash doesn't show a map,
	// but if we later add an unauthenticated map view this just works.
	void locals;

	try {
		const token = await mintMapkitToken(url.origin);
		return json({ token });
	} catch (err) {
		console.error('Failed to mint MapKit token:', err);
		throw error(500, 'Could not mint MapKit token');
	}
};
