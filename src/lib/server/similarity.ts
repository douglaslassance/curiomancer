/**
 * Shared taste-similarity primitives, used by both the matching queries
 * (matching.ts) and the radius-based people list (nearby.ts). Kept in their
 * own module so both can import them without a circular dependency (matching.ts
 * already imports haversineKm from nearby.ts).
 *
 * Each (user, place) row is a ±1 vote: 'liked' = +1, 'disliked' = -1 ('seen'
 * and 'want_to_go' carry no taste signal). Modeling each user as a sparse ±1
 * vector over places, the similarity of two users is the cosine of those
 * vectors, damped by significance weighting:
 *
 *              agreements - disagreements
 *     cosine = ---------------------------------      (dot product over shared
 *              sqrt(|A opinions| * |B opinions|)        places / product of norms)
 *
 *     score  = cosine * min(sharedCount, N) / N        (N = SIGNIFICANCE_FLOOR)
 *
 * Range -1..+1; the UI clamps to Math.max(0, score) as a 0..100 % badge.
 */

import { sql, type SQL } from 'drizzle-orm';

/**
 * Significance-weighting floor. Below this many shared opinions a pair's
 * cosine score is damped linearly (min(shared, N) / N), so agreeing on one
 * or two places can't read as a strong match. Tuned against the live score
 * distribution; raise it as users accumulate more relations.
 */
export const SIGNIFICANCE_FLOOR = 5;

/**
 * Minimum score to surface someone as a taste-twin. Applied by the people
 * list, the /twins API, and the home rail (previously a copy-pasted `> 0.5`
 * literal in each). Calibrated against the live cosine-score distribution,
 * which runs much lower than the old agreement-ratio it replaced.
 */
export const MATCH_THRESHOLD = 0.15;

/**
 * SQL fragment that, joined twice (alias `mine` for the viewer, `theirs`
 * for the candidate), produces `agreement` (+1/-1) for each overlapping
 * place.
 *
 *   sum(agreement) = (agreements) - (disagreements)  ... vector dot product
 *   count(*)       = (overlapping opinions)           ... sharedCount
 */
export const AGREEMENT_EXPR = sql`
	CASE
		WHEN mine.kind = theirs.kind THEN 1
		ELSE -1
	END
`;

/**
 * The one definition of the match score, built from its four pieces so every
 * query that ranks a pair agrees to the last decimal:
 *
 *   cosine = agreementSum / sqrt(mineTotal * theirsTotal)
 *   score  = cosine * min(sharedCount, N) / N
 *
 * Each argument is SQL that resolves to a number, so this composes over
 * aggregates (SUM(...) / COUNT(*)) and over already-materialized columns
 * alike. The score's sign is the sign of `agreementSum` (both other factors
 * are non-negative), so a `> 0` twin filter can equivalently guard on the
 * agreement sum.
 */
export function matchScoreExpr(
	agreementSum: SQL,
	sharedCount: SQL,
	mineTotal: SQL,
	theirsTotal: SQL
): SQL {
	return sql`
		((${agreementSum})::float / NULLIF(sqrt((${mineTotal})::float * (${theirsTotal})::float), 0))
		* LEAST((${sharedCount})::float, ${SIGNIFICANCE_FLOOR}::float) / ${SIGNIFICANCE_FLOOR}::float
	`;
}
