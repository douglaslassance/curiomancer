/**
 * Shared parsing for the message-history query string, used by both the
 * cookie route (api/conversations/[id]/messages) and the token route
 * (api/v1/conversations/[id]). Keeps the `limit` cap in one place so no client
 * can ask for an unbounded page.
 */
import { error } from '@sveltejs/kit';
import { DEFAULT_PAGE_SIZE, getMessages } from './messages';
import { getReactionsFor } from './reactions';
import { toMessagePayload } from './ws/protocol';

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

/**
 * Assemble a conversation's message-history page (messages + their reactions +
 * a `hasMore` flag) for a known conversation id. Shared by the cookie route
 * (api/conversations/[id]/messages) and the token route
 * (api/v1/conversations/[id]) so the response shape can't drift; each caller
 * does its own auth and conversation-id resolution first.
 */
export async function getConversationHistory(conversationId: string, url: URL) {
	const { since, before, limit } = parseHistoryQuery(url);
	const messages = await getMessages(conversationId, { since, before, limit });
	const reactions = await getReactionsFor(messages.map((m) => m.id));

	return {
		messages: messages.map(toMessagePayload),
		reactionsByMessage: Object.fromEntries(reactions),
		// A full page implies there may be older messages still. Never "more" on a
		// `since` resync, which returns the whole gap.
		hasMore: !since && messages.length === limit
	};
}
