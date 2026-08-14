import { getRecommendedPlaces } from './matching';
import { CURATED_CATEGORIES } from '../map-category';

/**
 * Per-place recommendation scores for the viewer's city, keyed by place id.
 *
 * A place scores above zero when a taste-twin likes it and the viewer hasn't
 * rated it. That's what separates the two greys on the map: a place nobody
 * matched to you has no pin of ours at all (Apple's own marker shows through),
 * while a recommended one keeps a pin, because it's the map telling you
 * something rather than just recording that the place exists.
 *
 * Shared by the `/places` page load and `GET /api/v1/places` so the web and the
 * native clients can't drift on which places are recommended - the same reason
 * both already read relations from `getRelationMap`.
 *
 * Only the curated categories are scored: `other` places (a university, a
 * hospital) are rate-able but never recommended.
 */
export async function getRecommendedScores(
	userId: string,
	city: string | null | undefined,
	limitPerCategory = 100
): Promise<Record<string, number>> {
	const scores: Record<string, number> = {};
	// Scores are per-city, so there's nothing to compute until we know where the
	// viewer is.
	if (!city) return scores;

	const sets = await Promise.all(
		CURATED_CATEGORIES.map((category) =>
			getRecommendedPlaces(userId, { kind: 'city', city }, category, limitPerCategory)
		)
	);
	for (const set of sets) {
		for (const rec of set) scores[rec.id] = rec.score;
	}
	return scores;
}
