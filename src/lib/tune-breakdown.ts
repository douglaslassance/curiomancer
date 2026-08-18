/**
 * Shape of the admin "why this showed" panel's data. Lives outside
 * +page.server.ts so the client component can type its prop without importing
 * a server module, the same arrangement as $lib/match-breakdown.ts.
 *
 * The ranking itself is defined once in $lib/server/tune.ts; these are the
 * terms that produced it:
 *
 *   proximity  = 1 - distanceKm / negativeAtKm      (signed, not clamped)
 *   match      = tasteScore / maxTasteScore         (0..1 across the candidates)
 *   popularity = log1p(likeCount) / log1p(maxLikeCount)
 *   score      = proximity + matchWeight * match + popularityWeight * popularity
 *
 * Both normalized terms are relative to the other candidates gathered on this
 * request, so the same place can score differently from a different location or
 * as places nearby are added. That is the single most confusing property of the
 * queue, which is most of why this panel exists.
 */
export type TuneBreakdown = {
	/** The blended score. Only places above zero are queued at all. */
	score: number;

	/** The three terms, before weighting. `proximity` can be negative. */
	proximity: number;
	match: number;
	popularity: number;

	/** The two weighted terms, as they actually land in the sum. */
	matchContribution: number;
	popularityContribution: number;

	distanceKm: number;

	/** Summed similarity of the twins who liked this place, and how many. */
	tasteScore: number;
	twinCount: number;
	/** Platform-wide likes, the raw input to the popularity term. */
	likeCount: number;

	/** The normalizing maxima across this request's candidate set. */
	maxTasteScore: number;
	maxLikeCount: number;

	/** Position in the queue, and how many places cleared zero. */
	rank: number;
	candidateCount: number;
	/** How many places were gathered before the score > 0 filter. */
	gatheredCount: number;

	/** Live constants, so the panel never hardcodes a number that moved. */
	negativeAtKm: number;
	maxDistanceKm: number;
	matchWeight: number;
	popularityWeight: number;
};
