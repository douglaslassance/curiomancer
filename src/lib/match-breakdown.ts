/**
 * Shape of the admin "why this match" panel's data. Lives outside
 * +page.server.ts so the client component can type its prop without importing
 * a server module.
 *
 * The score itself is defined once in $lib/server/similarity.ts; these are the
 * terms that produced it:
 *
 *   cosine = (agreements - disagreements) / sqrt(viewerTotal * targetTotal)
 *   score  = cosine * min(sharedCount, significanceFloor) / significanceFloor
 */

/** One place both the viewer and the profiled user took a stance on. */
export type SharedOpinion = {
	placeId: string;
	name: string;
	city: string;
	category: 'eat' | 'drink' | 'shop' | 'visit';
	viewerKind: 'liked' | 'disliked';
	targetKind: 'liked' | 'disliked';
	/** Same stance both ways: contributes +1 to the dot product, else -1. */
	agrees: boolean;
};

export type MatchBreakdown = {
	/** True when an admin is looking at their own page: nothing to compare. */
	isSelf: boolean;
	/** -1..+1, or null when either side has no signal or nothing overlaps. */
	score: number | null;
	/** The undamped cosine, before significance weighting. Null with no overlap. */
	cosine: number | null;
	/** min(shared, floor) / floor: how much the cosine was damped. */
	significance: number;
	agreements: number;
	disagreements: number;
	sharedCount: number;
	/** Liked + disliked totals, the vector lengths the cosine divides by. */
	viewerTotal: number;
	targetTotal: number;
	isTwin: boolean;
	threshold: number;
	significanceFloor: number;
	shared: SharedOpinion[];
};
