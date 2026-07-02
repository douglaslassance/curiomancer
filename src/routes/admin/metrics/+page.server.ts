import {
	getActiveUserSeries,
	getHeadlineMetrics,
	getSignupSeries,
	getSubscriberSeries
} from '$lib/server/metrics';
import type { PageServerLoad } from './$types';

const RANGES = [7, 30, 90] as const;
type Range = (typeof RANGES)[number];

export const load: PageServerLoad = async ({ url }) => {
	const requested = Number(url.searchParams.get('range'));
	const days: Range = (RANGES as readonly number[]).includes(requested) ? (requested as Range) : 30;

	const [headline, signups, subscribers, active] = await Promise.all([
		getHeadlineMetrics(),
		getSignupSeries(days),
		getSubscriberSeries(days),
		getActiveUserSeries(days)
	]);

	return { headline, signups, subscribers, active, days, ranges: RANGES };
};
