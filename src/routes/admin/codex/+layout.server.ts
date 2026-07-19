import {
	MATCH_WEIGHT,
	MAX_DISTANCE_KM,
	NEGATIVE_AT_KM,
	POPULARITY_WEIGHT,
	TWIN_LIMIT
} from '$lib/server/tune';
import { MATCH_THRESHOLD, SIGNIFICANCE_FLOOR } from '$lib/server/similarity';
import type { LayoutServerLoad } from './$types';

/**
 * The Codex: a read-only reference for how Curiomancer's algorithms work -
 * Tune (what to rate next), Match (the pairwise taste score), and Twins (who
 * that makes you similar to, and what it unlocks). One page per section; the
 * shared values load here so every sub-page gets them. They're the CURRENT
 * constants imported from code, so the Codex can't drift; editing still happens
 * in code + deploy (swap these for a config-table read for live tuning).
 */
export const load: LayoutServerLoad = async () => {
	return {
		tune: { NEGATIVE_AT_KM, MAX_DISTANCE_KM, MATCH_WEIGHT, POPULARITY_WEIGHT, TWIN_LIMIT },
		matching: { MATCH_THRESHOLD, SIGNIFICANCE_FLOOR }
	};
};
