/**
 * Client-side state for one open message thread: the message list, reaction
 * pills, and ephemeral typing state. Hydrated from the server-loaded page
 * data, then kept live by a WebSocket connection to
 * /ws/conversations/[id]. A factory, not a singleton like relations.svelte.ts
 * - one instance per open thread, since navigating to a different
 * conversation should start from a clean slate rather than carry over state.
 *
 * The sender's own message needs no hand-rolled optimistic entry: the
 * existing form action's use:enhance + update() already re-fetches
 * data.messages for the sender, and the WS message:new echo of that same
 * send matches by id in mergeNew - idempotent by construction, so there's
 * no separate "was this my optimistic entry" branch to get wrong.
 */
import { browser } from '$app/environment';
import type { MessageDTO } from './server/messages';
import type { ServerEvent } from './server/ws/protocol';

export type ReactionSummary = { emoji: string; userIds: string[] };

const TYPING_EXPIRY_MS = 3000;
const RECONNECT_MIN_MS = 500;
const RECONNECT_MAX_MS = 15000;
const OPEN_GRACE_MS = 3000;

class ConversationStore {
	#messages = $state<MessageDTO[]>([]);
	#reactions = $state<Map<string, ReactionSummary[]>>(new Map());
	#isOtherTyping = $state(false);
	#typingTimer: ReturnType<typeof setTimeout> | undefined;
	#conversationId = '';
	#otherUserId = '';
	#ws: WebSocket | null = null;
	#reconnectAttempt = 0;
	#reconnectTimer: ReturnType<typeof setTimeout> | undefined;
	#openedAt = 0;
	#gaveUp = false;

	hydrateFromServer(
		conversationId: string,
		otherUserId: string,
		messages: MessageDTO[],
		reactions: Record<string, ReactionSummary[]>
	) {
		this.#conversationId = conversationId;
		this.#otherUserId = otherUserId;
		this.#messages = messages;
		this.#reactions = new Map(Object.entries(reactions));
	}

	get messages(): MessageDTO[] {
		return this.#messages;
	}

	get isOtherTyping(): boolean {
		return this.#isOtherTyping;
	}

	reactionsFor(messageId: string): ReactionSummary[] {
		return this.#reactions.get(messageId) ?? [];
	}

	/** Replaces or appends a message by id - handles both the live echo of a
	 *  send and a message from the other participant, identically. */
	mergeNew(message: MessageDTO) {
		const i = this.#messages.findIndex((m) => m.id === message.id);
		if (i >= 0) this.#messages[i] = message;
		else this.#messages = [...this.#messages, message];
	}

	applyReaction(messageId: string, userId: string, emoji: string, added: boolean) {
		const next = new Map(this.#reactions);
		const current = next.get(messageId) ?? [];
		const idx = current.findIndex((r) => r.emoji === emoji);

		let updated: ReactionSummary[];
		if (added) {
			updated =
				idx >= 0
					? current.map((r, i) =>
							i === idx ? { ...r, userIds: [...new Set([...r.userIds, userId])] } : r
						)
					: [...current, { emoji, userIds: [userId] }];
		} else {
			updated = current
				.map((r) => (r.emoji === emoji ? { ...r, userIds: r.userIds.filter((u) => u !== userId) } : r))
				.filter((r) => r.userIds.length > 0);
		}
		next.set(messageId, updated);
		this.#reactions = next;
	}

	noteTyping() {
		this.#isOtherTyping = true;
		clearTimeout(this.#typingTimer);
		this.#typingTimer = setTimeout(() => (this.#isOtherTyping = false), TYPING_EXPIRY_MS);
	}

	sendTyping() {
		if (this.#ws?.readyState === WebSocket.OPEN) this.#ws.send(JSON.stringify({ type: 'typing' }));
	}

	connect(conversationId: string) {
		if (!browser) return;
		this.disconnect();
		this.#gaveUp = false;
		this.#conversationId = conversationId;
		this.#open();
	}

	disconnect() {
		clearTimeout(this.#reconnectTimer);
		clearTimeout(this.#typingTimer);
		this.#ws?.close();
		this.#ws = null;
	}

	#open() {
		const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
		const ws = new WebSocket(`${protocol}//${location.host}/ws/conversations/${this.#conversationId}`);
		this.#ws = ws;

		ws.addEventListener('open', () => {
			this.#openedAt = Date.now();
			this.#reconnectAttempt = 0;
			void this.#resync();
		});

		ws.addEventListener('message', (event) => {
			const parsed = JSON.parse(event.data) as ServerEvent;
			if (parsed.type === 'typing') this.noteTyping();
			else if (parsed.type === 'message:new') {
				this.mergeNew({ ...parsed.message, createdAt: new Date(parsed.message.createdAt) });
			} else if (parsed.type === 'reaction:added') {
				this.applyReaction(parsed.messageId, parsed.userId, parsed.emoji, true);
			} else if (parsed.type === 'reaction:removed') {
				this.applyReaction(parsed.messageId, parsed.userId, parsed.emoji, false);
			}
		});

		ws.addEventListener('close', () => {
			if (this.#ws !== ws) return; // superseded by a newer connection
			// Never got a stable open (the connection died within the grace
			// window, or never opened at all): most likely an auth/authorization
			// rejection, not a network blip - stop retrying rather than backing
			// off forever against a connection that will never succeed.
			if (!this.#openedAt || Date.now() - this.#openedAt < OPEN_GRACE_MS) {
				if (this.#reconnectAttempt > 0) {
					this.#gaveUp = true;
					return;
				}
			}
			this.#scheduleReconnect();
		});
	}

	#scheduleReconnect() {
		if (this.#gaveUp) return;
		const attempt = this.#reconnectAttempt++;
		const base = Math.min(RECONNECT_MAX_MS, RECONNECT_MIN_MS * 2 ** attempt);
		const delay = base * (0.8 + Math.random() * 0.4);
		this.#reconnectTimer = setTimeout(() => this.#open(), delay);
	}

	/** Refetches anything sent while disconnected, deduping by message id. */
	async #resync() {
		const last = this.#messages[this.#messages.length - 1];
		const since = last ? `?since=${encodeURIComponent(last.createdAt.toISOString())}` : '';
		const res = await fetch(`/api/conversations/${this.#otherUserId}/messages${since}`);
		if (!res.ok) return;
		const data = (await res.json()) as { messages: (Omit<MessageDTO, 'createdAt'> & { createdAt: string })[] };
		for (const m of data.messages) this.mergeNew({ ...m, createdAt: new Date(m.createdAt) });
	}
}

export function createConversationStore() {
	return new ConversationStore();
}
