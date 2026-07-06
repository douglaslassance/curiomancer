/**
 * Client-side state for one open message thread: the message list, reaction
 * pills, and ephemeral typing state. Hydrated from the server-loaded page
 * data, then kept live by a WebSocket connection to
 * /ws/conversations/[id]. A factory, not a singleton like relations.svelte.ts
 * - one instance per open thread, since navigating to a different
 * conversation should start from a clean slate rather than carry over state.
 *
 * Correctness never depends on the socket being up. Writes go through REST and
 * are merged in by id (mergeNew / mergeServerMessages), reactions apply
 * optimistically from their own POST response, and a reconnect resyncs the gap.
 * The socket is a latency optimization on top of that, not the source of truth.
 */
import { browser } from '$app/environment';
import type { MessageDTO } from './server/messages';
import type { ServerEvent } from './server/ws/protocol';

export type ReactionSummary = { emoji: string; userIds: string[] };

const TYPING_EXPIRY_MS = 3000;
// Coalesce keystrokes: at most one typing notice this often while composing.
const TYPING_THROTTLE_MS = 2000;
const RECONNECT_MIN_MS = 500;
const RECONNECT_MAX_MS = 15000;
// Application-level liveness (see ws/protocol.ts): ping this often, and if no
// frame at all has come back in PONG_TIMEOUT_MS the socket is half-open, so
// force it closed and let the reconnect + resync recover.
const PING_INTERVAL_MS = 25000;
const PONG_TIMEOUT_MS = 60000;
// Our application close codes. A close with either means the handshake
// authenticated but authorization was refused - retrying can't fix that.
const WS_CLOSE_UNAUTHORIZED = 4401;
const WS_CLOSE_FORBIDDEN = 4403;

class ConversationStore {
	#messages = $state<MessageDTO[]>([]);
	#reactions = $state<Map<string, ReactionSummary[]>>(new Map());
	#hasMore = $state(false);
	#isOtherTyping = $state(false);
	#typingTimer: ReturnType<typeof setTimeout> | undefined;
	#lastTypingSentAt = 0;
	#conversationId = '';
	#otherUserId = '';
	#ws: WebSocket | null = null;
	#reconnectAttempt = 0;
	#reconnectTimer: ReturnType<typeof setTimeout> | undefined;
	#pingTimer: ReturnType<typeof setInterval> | undefined;
	#lastPongAt = 0;
	#gaveUp = false;
	#loadingOlder = false;

	hydrateFromServer(
		conversationId: string,
		otherUserId: string,
		messages: MessageDTO[],
		reactions: Record<string, ReactionSummary[]>,
		hasMore: boolean
	) {
		this.#conversationId = conversationId;
		this.#otherUserId = otherUserId;
		this.#messages = messages;
		this.#reactions = new Map(Object.entries(reactions));
		this.#hasMore = hasMore;
	}

	get messages(): MessageDTO[] {
		return this.#messages;
	}

	get hasMore(): boolean {
		return this.#hasMore;
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

	/** Merges a batch of server messages + their reactions without discarding
	 *  anything already loaded (e.g. older messages backfilled on scroll). Used
	 *  after a form send so the sender sees their message even if the socket is
	 *  down. */
	mergeServerMessages(messages: MessageDTO[], reactions: Record<string, ReactionSummary[]>) {
		for (const m of messages) this.mergeNew(m);
		const next = new Map(this.#reactions);
		for (const [id, summary] of Object.entries(reactions)) next.set(id, summary);
		this.#reactions = next;
	}

	#setReaction(messageId: string, userId: string, emoji: string, added: boolean) {
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

	/** Applies a reaction change coming from the other participant over the
	 *  socket. */
	applyRemoteReaction(messageId: string, userId: string, emoji: string, added: boolean) {
		this.#setReaction(messageId, userId, emoji, added);
	}

	/**
	 * Toggles the signed-in user's reaction, optimistically. The UI updates
	 * immediately, the POST reconciles against the server's authoritative
	 * `added`, and any failure rolls back - so reactions work whether or not the
	 * socket is up (the server excludes us from its broadcast, since we own our
	 * own state here).
	 */
	async toggleReaction(messageId: string, emoji: string, selfUserId: string) {
		const reactedBefore =
			this.#reactions.get(messageId)?.find((r) => r.emoji === emoji)?.userIds.includes(selfUserId) ??
			false;
		const optimisticAdded = !reactedBefore;
		this.#setReaction(messageId, selfUserId, emoji, optimisticAdded);

		try {
			const res = await fetch(`/api/messages/${messageId}/reactions`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ emoji })
			});
			if (!res.ok) throw new Error(`Status ${res.status}`);
			const { added } = (await res.json()) as { added: boolean };
			// A concurrent toggle elsewhere can make the guess wrong; trust the server.
			if (added !== optimisticAdded) this.#setReaction(messageId, selfUserId, emoji, added);
		} catch (err) {
			this.#setReaction(messageId, selfUserId, emoji, reactedBefore); // roll back
			console.error('Reaction failed:', err);
		}
	}

	noteTyping() {
		this.#isOtherTyping = true;
		clearTimeout(this.#typingTimer);
		this.#typingTimer = setTimeout(() => (this.#isOtherTyping = false), TYPING_EXPIRY_MS);
	}

	sendTyping() {
		const now = Date.now();
		if (now - this.#lastTypingSentAt < TYPING_THROTTLE_MS) return;
		if (this.#ws?.readyState === WebSocket.OPEN) {
			this.#ws.send(JSON.stringify({ type: 'typing' }));
			this.#lastTypingSentAt = now;
		}
	}

	/** Fetches the page of messages just older than the oldest we hold, for
	 *  scroll-up backfill. Returns how many new messages were prepended so the
	 *  caller can preserve scroll position. */
	async loadOlder(): Promise<number> {
		if (this.#loadingOlder || !this.#hasMore) return 0;
		const oldest = this.#messages[0];
		if (!oldest) return 0;
		this.#loadingOlder = true;
		try {
			const res = await fetch(
				`/api/conversations/${this.#otherUserId}/messages?before=${encodeURIComponent(oldest.createdAt.toISOString())}`
			);
			if (!res.ok) return 0;
			const data = (await res.json()) as {
				messages: (Omit<MessageDTO, 'createdAt'> & { createdAt: string })[];
				reactionsByMessage: Record<string, ReactionSummary[]>;
				hasMore: boolean;
			};
			const have = new Set(this.#messages.map((m) => m.id));
			const older = data.messages
				.map((m) => ({ ...m, createdAt: new Date(m.createdAt) }))
				.filter((m) => !have.has(m.id));
			this.#messages = [...older, ...this.#messages];
			const next = new Map(this.#reactions);
			for (const [id, summary] of Object.entries(data.reactionsByMessage)) next.set(id, summary);
			this.#reactions = next;
			this.#hasMore = data.hasMore;
			return older.length;
		} finally {
			this.#loadingOlder = false;
		}
	}

	connect(conversationId: string) {
		if (!browser) return;
		this.disconnect();
		this.#gaveUp = false;
		this.#reconnectAttempt = 0;
		this.#conversationId = conversationId;
		this.#open();
	}

	disconnect() {
		clearTimeout(this.#reconnectTimer);
		clearTimeout(this.#typingTimer);
		this.#stopPing();
		const ws = this.#ws;
		this.#ws = null; // clear first so the close handler treats it as superseded
		ws?.close();
	}

	#open() {
		const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
		const ws = new WebSocket(`${protocol}//${location.host}/ws/conversations/${this.#conversationId}`);
		this.#ws = ws;

		ws.addEventListener('open', () => {
			this.#reconnectAttempt = 0;
			this.#startPing();
			void this.#resync();
		});

		ws.addEventListener('message', (event) => {
			// Any frame proves the socket is live, resetting the pong watchdog.
			this.#lastPongAt = Date.now();
			const parsed = JSON.parse(event.data) as ServerEvent;
			if (parsed.type === 'typing') this.noteTyping();
			else if (parsed.type === 'message:new') {
				this.mergeNew({ ...parsed.message, createdAt: new Date(parsed.message.createdAt) });
			} else if (parsed.type === 'reaction:added') {
				this.applyRemoteReaction(parsed.messageId, parsed.userId, parsed.emoji, true);
			} else if (parsed.type === 'reaction:removed') {
				this.applyRemoteReaction(parsed.messageId, parsed.userId, parsed.emoji, false);
			}
		});

		ws.addEventListener('close', (event) => {
			if (this.#ws !== ws) return; // superseded by a newer connection
			this.#stopPing();
			// Authorization refused (see ws/upgrade.ts): retrying won't help.
			if (event.code === WS_CLOSE_UNAUTHORIZED || event.code === WS_CLOSE_FORBIDDEN) {
				this.#gaveUp = true;
				return;
			}
			this.#scheduleReconnect();
		});
	}

	#startPing() {
		this.#stopPing();
		this.#lastPongAt = Date.now();
		this.#pingTimer = setInterval(() => {
			const ws = this.#ws;
			if (!ws || ws.readyState !== WebSocket.OPEN) return;
			if (Date.now() - this.#lastPongAt > PONG_TIMEOUT_MS) {
				// Half-open: the close handler will reconnect and #resync backfills.
				ws.close();
				return;
			}
			ws.send(JSON.stringify({ type: 'ping' }));
		}, PING_INTERVAL_MS);
	}

	#stopPing() {
		clearInterval(this.#pingTimer);
		this.#pingTimer = undefined;
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
		const data = (await res.json()) as {
			messages: (Omit<MessageDTO, 'createdAt'> & { createdAt: string })[];
			reactionsByMessage?: Record<string, ReactionSummary[]>;
		};
		for (const m of data.messages) this.mergeNew({ ...m, createdAt: new Date(m.createdAt) });
		if (data.reactionsByMessage) {
			const next = new Map(this.#reactions);
			for (const [id, summary] of Object.entries(data.reactionsByMessage)) next.set(id, summary);
			this.#reactions = next;
		}
	}
}

export function createConversationStore() {
	return new ConversationStore();
}
