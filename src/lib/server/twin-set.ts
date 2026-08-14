import { sql, type SQL } from 'drizzle-orm';
import { AGREEMENT_EXPR, MATCH_THRESHOLD, matchScoreExpr } from './similarity';

/**
 * The viewer's taste-twins, direct and one hop out.
 *
 * A twin is someone whose match score clears MATCH_THRESHOLD. Twinship is then
 * taken to be transitive at one remove: if A twins B and B twins C, C is a twin
 * of A. That's a product decision rather than a property of the score - the
 * score is a cosine, and two links at the threshold bound the indirect pair no
 * better than "could be anything" - so an indirect twin is admitted on the
 * strength of its chain rather than re-measured.
 *
 * Its score is the weaker of the two links, which is the same rule
 * `getSharedTwins` already uses for a chained pair. That keeps the number
 * meaningful (a chain is only as good as its weakest step) and, just as
 * importantly, keeps it above MATCH_THRESHOLD - so an indirect twin reads as an
 * ordinary twin everywhere it's displayed. How twinship was derived is internal;
 * nobody should be able to tell from a match percentage that they were reached
 * through someone else. Multiplying the links instead would drag every indirect
 * twin below the threshold and give the mechanism away.
 *
 * Stopping at one hop is deliberate. Each hop multiplies a number below 1, and
 * the reachable set grows toward everybody; past one hop the ranking degenerates
 * into popularity, which Tune already blends in separately (POPULARITY_WEIGHT).
 *
 * `limit` caps the set for ranking callers; pass null to ask the pure question
 * "is this person a twin at all", which must not depend on a cutoff.
 *
 * Emits CTEs named `my_relations`, `my_total`, `their_totals`, `pair_stats`,
 * `direct_twins`, `hop_totals`, `hop_stats`, `indirect_twins` and finally
 * `twins(user_id, score)` - the one every caller reads. Callers splice it into
 * their own WITH clause and must not reuse those names.
 */
export function twinSetCte(userId: SQL | string, limit: number | null): SQL {
	const me = typeof userId === 'string' ? sql`${userId}` : userId;
	// Blocks cut both ways, and they have to cut on the hop too: a blocked user
	// must not reach the viewer by standing one step further away.
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
		pair_stats AS (
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
		direct_twins AS (
			SELECT user_id, score
			FROM pair_stats
			WHERE score > ${MATCH_THRESHOLD}
			ORDER BY score DESC
			${limit === null ? sql`` : sql`LIMIT ${limit}`}
		),
		hop_totals AS (
			SELECT user_id, COUNT(*)::float AS n
			FROM "place_relation"
			WHERE kind IN ('liked', 'disliked')
			GROUP BY user_id
		),
		-- Each direct twin scored against everyone they overlap with. Same score
		-- definition, just keyed on the twin instead of the viewer.
		hop_stats AS (
			SELECT
				dt.user_id AS via,
				theirs.user_id AS user_id,
				${matchScoreExpr(
					sql`SUM(${AGREEMENT_EXPR})`,
					sql`COUNT(*)`,
					sql`vn.n`,
					sql`tt.n`
				)} AS score
			FROM direct_twins dt
			JOIN "place_relation" mine
			  ON mine.user_id = dt.user_id AND mine.kind IN ('liked', 'disliked')
			JOIN "place_relation" theirs
			  ON theirs.place_id = mine.place_id AND theirs.kind IN ('liked', 'disliked')
			JOIN hop_totals vn ON vn.user_id = dt.user_id
			JOIN hop_totals tt ON tt.user_id = theirs.user_id
			WHERE theirs.user_id <> dt.user_id
			  AND theirs.user_id <> ${me}
			  AND theirs.user_id NOT IN (${blocked})
			GROUP BY dt.user_id, theirs.user_id, vn.n, tt.n
		),
		indirect_twins AS (
			SELECT hs.user_id, MAX(LEAST(dt.score, hs.score))::float AS score
			FROM hop_stats hs
			JOIN direct_twins dt ON dt.user_id = hs.via
			WHERE hs.score > ${MATCH_THRESHOLD}
			  -- A direct twin is already in, at its own undamped score.
			  AND hs.user_id NOT IN (SELECT user_id FROM direct_twins)
			GROUP BY hs.user_id
		),
		twins AS (
			SELECT user_id, score FROM direct_twins
			UNION ALL
			SELECT user_id, score FROM indirect_twins
			ORDER BY score DESC
			${limit === null ? sql`` : sql`LIMIT ${limit}`}
		)
	`;
}
