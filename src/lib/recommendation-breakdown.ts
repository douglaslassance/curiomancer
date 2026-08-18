/**
 * Shape of the admin "why is this recommended" panel's data. Lives outside the
 * server modules so the popup can type its prop without importing one, the same
 * arrangement as $lib/match-breakdown.ts and $lib/tune-breakdown.ts.
 *
 * The ranking is defined once in getRecommendedPlaces (matching.ts); these are
 * the terms behind it:
 *
 *   agreement = SUM(w * vote) / SUM(|w|)      across every twin who rated it
 *   score     = agreement * MAX(w among twins who liked it)
 *
 * where `w` is a twin's similarity. So the score is the strongest twin backing
 * the place, discounted by however much the viewer's other twins push against
 * it, and it can never exceed a real person's twin score.
 */

/** One twin who took a stance on this place. */
export type RecommendingTwin = {
	userId: string;
	name: string;
	/** Their similarity to the viewer, the `w` above. */
	score: number;
	kind: 'liked' | 'disliked';
};

export type RecommendationBreakdown = {
	/**
	 * The final score, or null when the place is not recommended at all: no twin
	 * rated it, the net was negative, or it fell under the threshold.
	 */
	score: number | null;
	/** Weighted agreement across every twin who rated it, -1..1. */
	agreement: number | null;
	/** The strongest twin who likes it, which caps the score. Null if none do. */
	bestEndorser: RecommendingTwin | null;
	/** Every twin with a stance, strongest first. */
	twins: RecommendingTwin[];
	/** True when the viewer already rated it, which excludes it from the queue. */
	viewerHasRated: boolean;
	/** Same bar twins use, so the panel never hardcodes a number that moved. */
	threshold: number;
};
