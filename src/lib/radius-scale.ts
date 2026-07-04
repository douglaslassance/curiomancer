/**
 * Non-linear mapping between a slider's linear position and a km radius.
 * Linear felt bad: stretching 1..20016 across one slider meant most of the
 * drag distance was wasted on values nobody uses (who needs to fine-tune
 * between 18000 and 19000 km?) while the useful 5-1000 km range got only a
 * few pixels. Exponential fixes that - most of the position range covers
 * the useful low end, and the last stretch sweeps through the big numbers.
 */
export const MIN_RADIUS_KM = 5;
// Antipodal distance (pi * 6371, mirrors MAX_RADIUS_KM in $lib/server/nearby.ts) -
// the farthest any two points on Earth can be, so a radius this large always
// covers the whole planet.
export const MAX_RADIUS_KM = 20016;

/** The slider's own (linear) position domain - not a km value. */
export const RADIUS_POSITION_MAX = 1000;

const RATIO = MAX_RADIUS_KM / MIN_RADIUS_KM;

export function positionToRadiusKm(position: number): number {
	const t = Math.min(1, Math.max(0, position / RADIUS_POSITION_MAX));
	return Math.round(MIN_RADIUS_KM * Math.pow(RATIO, t));
}

/** Inverse of positionToRadiusKm - used to resync the handle to a km value that came from the URL. */
export function radiusKmToPosition(km: number): number {
	const clamped = Math.min(MAX_RADIUS_KM, Math.max(MIN_RADIUS_KM, km));
	return Math.round((RADIUS_POSITION_MAX * Math.log(clamped / MIN_RADIUS_KM)) / Math.log(RATIO));
}

export function formatRadiusKm(km: number): string {
	return km >= MAX_RADIUS_KM ? 'Earth' : `${km} km`;
}
