import { sql, type SQL } from 'drizzle-orm';
import { AGREEMENT_EXPR, MATCH_THRESHOLD, matchScoreExpr } from './similarity';

/**
 * Taste similarity with transitivity, the one number the whole product runs on.
 *
 * The direct score (see similarity.ts) only exists between people who have
 * rated some of the same places. That's most pairs at zero, and it's why a
 * strong match in London tells you nothing about a stranger in Amsterdam even
 * when a mutual friend connects you. Propagation fixes that: similarity flows
 * along the graph, the way trust does in trust-propagation recommenders.
 *
 *     S = A + d·A²        (A = measured pairwise similarity, d = decay)
 *
 * A Katz-style walk, truncated at PROPAGATION_DEPTH. Every path of length 2
 * contributes the product of its two links, damped by `d`, and the products sum
 * - so several weak mutual connections can add up to a real signal, which is
 * the behaviour a single "best chain" rule throws away.
 *
 * The signs carry through, which is the useful part of doing this on a signed
 * graph: agreeing with someone who agrees with X pushes you toward X, and
 * disagreeing with someone who disagrees with X does too. Both fall out of the
 * multiplication rather than needing a rule.
 *
 * One score, two uses. A twin is anyone whose propagated similarity clears
 * MATCH_THRESHOLD, and recommendations are weighted by that same number, so
 * "who am I close to" and "whose places should I see" can't disagree. Nothing
 * downstream knows or cares whether a given score came from a direct overlap or
 * through someone else.
 *
 * Emits CTEs named `my_relations`, `my_total`, `their_totals`, `direct`, `via`,
 * `second_hop`, `indirect`, `similarity` and `twins`. Callers splice this into
 * their own WITH clause and must not reuse those names.
 */

/**
 * How far similarity travels. 2 = direct plus one intermediary. Each extra step
 * is another self-join over the relation table, and with decay applied per step
 * a third contributes little; raise it only with numbers to justify the cost.
 */
export const PROPAGATION_DEPTH = 2;

/**
 * Per-step damping (`d` above). Below 1 so a propagated path always counts for
 * less than a measured one, and so the series converges as depth grows. At 0.5
 * a two-link path of 0.4 × 0.4 contributes 0.08 - real, but it takes several
 * such paths to reach the twin bar on their own.
 */
export const PROPAGATION_DECAY = 0.5;

/**
 * How many of the strongest direct matches similarity is allowed to travel
 * through. Bounds the second-hop join, which is the expensive part, and costs
 * little: paths through a weak intermediary contribute almost nothing anyway.
 */
export const PROPAGATION_VIA_LIMIT = 20;

/**
 * @param limit caps the returned twin set for ranking callers. Pass null when
 * asking the pure question "is this person a twin", which must not depend on a
 * cutoff.
 */
export function tasteGraphCte(userId: SQL | string, limit: number | null): SQL {
	const me = typeof userId === 'string' ? sql`${userId}` : userId;
	// Blocks cut on the hop too: a blocked user must not reach the viewer by
	// standing one step further away.
	const blocked = sql`
		SELECT blocked_id FROM "block" WHERE blocker_id = ${me}
		UNION
		SELECT blocker_id FROM "block" WHERE blocked_id = ${me}
	`;

	return sql`
		my_relations AS (
			SELECT place_id, kind FROM "place_relation"
			WHERE user_id = ${me} AND kind IN ('liked', 'disliked')
		),
		my_total AS (SELECT COUNT(*)::float AS n FROM my_relations),
		their_totals AS (
			SELECT user_id, COUNT(*)::float AS n
			FROM "place_relation"
			WHERE kind IN ('liked', 'disliked')
			GROUP BY user_id
		),
		-- A: measured similarity to everyone we share an opinion with.
		direct AS (
			SELECT
				theirs.user_id,
				${matchScoreExpr(
					sql`SUM(${AGREEMENT_EXPR})`,
					sql`COUNT(*)`,
					sql`(SELECT n FROM my_total)`,
					sql`tt.n`
				)} AS score
			FROM "place_relation" theirs
			JOIN my_relations mine ON mine.place_id = theirs.place_id
			JOIN their_totals tt ON tt.user_id = theirs.user_id
			WHERE theirs.user_id <> ${me}
			  AND theirs.kind IN ('liked', 'disliked')
			  AND theirs.user_id NOT IN (${blocked})
			GROUP BY theirs.user_id, tt.n
		),
		-- The intermediaries worth routing through.
		via AS (
			SELECT user_id, score
			FROM direct
			WHERE score > ${MATCH_THRESHOLD}
			ORDER BY score DESC
			LIMIT ${PROPAGATION_VIA_LIMIT}
		),
		-- A again, but measured from each intermediary outward.
		second_hop AS (
			SELECT
				v.user_id AS via_id,
				theirs.user_id,
				${matchScoreExpr(
					sql`SUM(${AGREEMENT_EXPR})`,
					sql`COUNT(*)`,
					sql`vn.n`,
					sql`tt.n`
				)} AS score
			FROM via v
			JOIN "place_relation" mine
			  ON mine.user_id = v.user_id AND mine.kind IN ('liked', 'disliked')
			JOIN "place_relation" theirs
			  ON theirs.place_id = mine.place_id AND theirs.kind IN ('liked', 'disliked')
			JOIN their_totals vn ON vn.user_id = v.user_id
			JOIN their_totals tt ON tt.user_id = theirs.user_id
			WHERE theirs.user_id <> v.user_id
			  AND theirs.user_id <> ${me}
			  AND theirs.user_id NOT IN (${blocked})
			GROUP BY v.user_id, theirs.user_id, vn.n, tt.n
		),
		-- d·A²: every length-2 path, its two links multiplied, summed per person.
		indirect AS (
			SELECT sh.user_id, (${PROPAGATION_DECAY} * SUM(v.score * sh.score))::float AS score
			FROM second_hop sh
			JOIN via v ON v.user_id = sh.via_id
			GROUP BY sh.user_id
		),
		-- S = A + d·A². Someone with both a measured overlap and paths through
		-- others gets the sum, which is the point of doing this additively.
		similarity AS (
			SELECT user_id, SUM(score)::float AS score
			FROM (
				SELECT user_id, score FROM direct
				UNION ALL
				SELECT user_id, score FROM indirect
			) parts
			GROUP BY user_id
		),
		twins AS (
			SELECT user_id, score
			FROM similarity
			WHERE score > ${MATCH_THRESHOLD}
			ORDER BY score DESC
			${limit === null ? sql`` : sql`LIMIT ${limit}`}
		)
	`;
}
