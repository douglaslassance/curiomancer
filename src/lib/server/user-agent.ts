/**
 * Coarse "is this a phone?" check from the request User-Agent. Used to hide the
 * Google Maps import (a download-a-Takeout-file, then upload-it flow that's
 * impractical on a phone) from onboarding and the dashboard cold-start banner.
 *
 * Deliberately phones only, not tablets: an iPad can handle the file wizard.
 * Server-side so the decision is made before render (no flash of the import CTA).
 */
export function isMobileUserAgent(userAgent: string | null | undefined): boolean {
	if (!userAgent) return false;
	return /Android.+Mobile|iPhone|iPod|Windows Phone|BlackBerry|Opera Mini|IEMobile/i.test(
		userAgent
	);
}
