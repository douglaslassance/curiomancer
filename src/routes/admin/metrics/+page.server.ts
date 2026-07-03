import {
	getActiveUserSeries,
	getHeadlineMetrics,
	getRecommendationConversionSeries,
	getSignupSeries,
	getSubscriberSeries
} from '$lib/server/metrics';
import type { PageServerLoad } from './$types';

const RANGES = [7, 30, 90] as const;
type Range = (typeof RANGES)[number];

export const load: PageServerLoad = async ({ url }) => {
	const requested = Number(url.searchParams.get('range'));
	const days: Range = (RANGES as readonly number[]).includes(requested) ? (requested as Range) : 30;

	const [headline, signups, subscribers, active, conversion] = await Promise.all([
		getHeadlineMetrics(),
		getSignupSeries(days),
		getSubscriberSeries(days),
		getActiveUserSeries(days),
		getRecommendationConversionSeries(days)
	]);

	// Sum raw counts across the range before dividing - averaging per-day
	// rates would misweight low-traffic days.
	const conversionTotals = conversion.reduce(
		(acc, p) => ({
			impressions: acc.impressions + p.twinImpressions + p.followImpressions + p.popularImpressions,
			conversions: acc.conversions + p.twinConversions + p.followConversions + p.popularConversions,
			twinImpressions: acc.twinImpressions + p.twinImpressions,
			twinConversions: acc.twinConversions + p.twinConversions,
			followImpressions: acc.followImpressions + p.followImpressions,
			followConversions: acc.followConversions + p.followConversions,
			popularImpressions: acc.popularImpressions + p.popularImpressions,
			popularConversions: acc.popularConversions + p.popularConversions
		}),
		{
			impressions: 0,
			conversions: 0,
			twinImpressions: 0,
			twinConversions: 0,
			followImpressions: 0,
			followConversions: 0,
			popularImpressions: 0,
			popularConversions: 0
		}
	);

	return {
		headline,
		signups,
		subscribers,
		active,
		conversion,
		conversionTotals,
		days,
		ranges: RANGES
	};
};
