/**
 * Shared parsing for the message-history query string, used by both the
 * cookie route (api/conversations/[id]/messages) and the token route
 * (api/v1/conversations/[id]). Keeps the `limit` cap in one place so no client
 * can ask for an unbounded page.
 */
import { error } from '@sveltejs/kit';
import { DEFAULT_PAGE_SIZE } from './messages';

const MAX_PAGE_SIZE = 100;

function parseTimestamp(raw: string | null, label: string): Date | undefined {
	if (!raw) return undefined;
	const d = new Date(raw);
	if (Number.isNaN(d.getTime())) throw error(400, `Invalid ${label} timestamp.`);
	return d;
}

export function parseHistoryQuery(url: URL): {
	since?: Date;
	before?: Date;
	limit: number;
} {
	const since = parseTimestamp(url.searchParams.get('since'), 'since');
	const before = parseTimestamp(url.searchParams.get('before'), 'before');

	const limitParam = url.searchParams.get('limit');
	let limit = DEFAULT_PAGE_SIZE;
	if (limitParam !== null) {
		const n = Number(limitParam);
		if (!Number.isInteger(n) || n < 1) throw error(400, 'Invalid limit.');
		limit = Math.min(n, MAX_PAGE_SIZE);
	}

	return { since, before, limit };
}
