/**
 * Pub/sub for realtime conversation events, fanned out across every running
 * instance via Postgres LISTEN/NOTIFY (the `postgres` client also used in
 * db/index.ts supports sql.listen()/sql.notify()). `broadcast` always
 * delivers to this instance's own local sockets immediately, then publishes
 * the same event on a shared channel so every other instance's copy of this
 * module delivers it to whichever sockets *it* holds - a conversation's two
 * participants can be connected to two different instances and still reach
 * each other.
 *
 * Each broadcast is tagged with this process's instanceId. The listener
 * skips notifications carrying its own instanceId, since local delivery
 * already happened synchronously above - without that check, an instance
 * listening on the same channel it just published to would deliver the
 * event to its own sockets twice.
 *
 * A NOTIFY payload is capped by Postgres at ~8000 bytes. messages.ts's
 * MAX_MESSAGE_LENGTH (4096 chars) keeps a realistic message:new envelope
 * comfortably under that, though a pathological body of ~2000+ multi-byte
 * characters could still approach the cap. Either way the failure is
 * contained to the cross-instance push: the message is already durably
 * saved by the REST handler that called broadcast, same-instance recipients
 * already got it via the synchronous path above, and any other instance's
 * recipients catch up via the client's `since=` resync on reconnect.
 *
 * This module reads `process.env.DATABASE_URL` directly rather than
 * `$env/dynamic/private`: it's loaded twice in this process under two
 * different module graphs, once as plain source via tsx (server.ts /
 * ws/upgrade.ts), where SvelteKit's virtual env modules don't resolve, and
 * once bundled into the Vite SSR output (imported by +server.ts route
 * handlers that call `broadcast` after writing a message/reaction). Two
 * module instances would also mean two separate connection Maps and two
 * separate LISTEN subscriptions, so registerConnection/broadcast would
 * silently talk past each other and every cross-instance event would be
 * delivered twice. Symbol.for gives both copies the same slots on
 * `globalThis`, so there's exactly one Map, one sweep timer, one pub/sub
 * client, and one instanceId either way.
 */
// Fills in process.env.DATABASE_URL from .env in dev - same reason seed.ts and
// the backfill scripts do this: `vite dev` resolves $env/dynamic/private
// through Vite's own env loading, which doesn't reach plain process.env.
// In production the container sets DATABASE_URL directly and this is a no-op
// (dotenv never overwrites an already-set var).
import 'dotenv/config';
import type { WebSocket } from 'ws';
import postgres from 'postgres';
import type { ServerEvent } from './protocol';

type ConnectionHandle = { ws: WebSocket; userId: string; lastSeenAt: number };

type BroadcastEnvelope = {
	originId: string;
	conversationId: string;
	excludeUserId?: string;
	event: ServerEvent;
};

const REGISTRY_KEY = Symbol.for('curiomancer.ws.conversations');
const SWEEP_KEY = Symbol.for('curiomancer.ws.sweep');
const PUBSUB_KEY = Symbol.for('curiomancer.ws.pubsub');
const INSTANCE_KEY = Symbol.for('curiomancer.ws.instanceId');

// Shared by every instance; only ever carries our own JSON envelopes.
const CHANNEL = 'curiomancer_ws_broadcast';

// A client pings every ~25s (see conversation.svelte.ts). Terminating after
// ~2.5 missed pings tolerates a hiccup without leaving a half-open socket on
// a dropped mobile connection collecting broadcasts into the void.
const CLIENT_TIMEOUT_MS = 70_000;
const SWEEP_INTERVAL_MS = 30_000;

function getConversations(): Map<string, Set<ConnectionHandle>> {
	const g = globalThis as unknown as { [REGISTRY_KEY]?: Map<string, Set<ConnectionHandle>> };
	if (!g[REGISTRY_KEY]) g[REGISTRY_KEY] = new Map();
	return g[REGISTRY_KEY];
}

const conversations = getConversations();

/**
 * Starts the single per-process sweep that terminates sockets which have gone
 * quiet past CLIENT_TIMEOUT_MS. Guarded through the same global slot the Map
 * uses so the two module instances (tsx source + Vite SSR bundle) share one
 * timer; unref'd so it never keeps the process alive on its own.
 */
function ensureSweep(): void {
	const g = globalThis as unknown as { [SWEEP_KEY]?: ReturnType<typeof setInterval> };
	if (g[SWEEP_KEY]) return;
	const timer = setInterval(() => {
		const now = Date.now();
		for (const set of conversations.values()) {
			for (const handle of set) {
				// terminate() fires 'close', whose handler removes the handle and
				// prunes the now-empty set, so no bookkeeping is needed here.
				if (now - handle.lastSeenAt > CLIENT_TIMEOUT_MS) handle.ws.terminate();
			}
		}
	}, SWEEP_INTERVAL_MS);
	timer.unref();
	g[SWEEP_KEY] = timer;
}

/** Stable per-process id, used to recognize (and skip) our own broadcasts coming back over NOTIFY. */
function getInstanceId(): string {
	const g = globalThis as unknown as { [INSTANCE_KEY]?: string };
	if (!g[INSTANCE_KEY]) g[INSTANCE_KEY] = crypto.randomUUID();
	return g[INSTANCE_KEY];
}

/**
 * Lazily creates the single per-process Postgres connection used to fan
 * events out to other instances, and starts listening on it. Guarded
 * through the same global slot pattern as the conversations Map/sweep timer
 * so both module graphs in this process share one LISTEN subscription -
 * two would mean every foreign broadcast gets delivered locally twice.
 */
function getPubSub(): ReturnType<typeof postgres> {
	const g = globalThis as unknown as { [PUBSUB_KEY]?: ReturnType<typeof postgres> };
	if (g[PUBSUB_KEY]) return g[PUBSUB_KEY];

	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) throw new Error('DATABASE_URL is not set');

	const sql = postgres(databaseUrl, { max: 1 });
	sql
		.listen(CHANNEL, (raw) => {
			let envelope: BroadcastEnvelope;
			try {
				envelope = JSON.parse(raw);
			} catch {
				return;
			}
			if (envelope.originId === getInstanceId()) return; // already delivered locally
			deliverLocally(envelope.conversationId, envelope.event, envelope.excludeUserId);
		})
		.catch((err) => console.error('[ws] pubsub listen failed:', err));

	g[PUBSUB_KEY] = sql;
	return sql;
}

// How many simultaneous sockets one user may hold on a single conversation.
// Two devices plus a reconnect overlap is plenty; beyond that it's a bug or
// abuse, so evict their oldest.
const MAX_PER_USER_PER_CONVERSATION = 5;

/** Registers a live connection and wires its inbound events and cleanup. */
export function registerConnection(conversationId: string, userId: string, ws: WebSocket): void {
	ensureSweep();
	getPubSub();
	const handle: ConnectionHandle = { ws, userId, lastSeenAt: Date.now() };
	let set = conversations.get(conversationId);
	if (!set) conversations.set(conversationId, (set = new Set()));

	// Bound connections per user so a client can't open sockets without limit.
	const mine = [...set].filter((h) => h.userId === userId).sort((a, b) => a.lastSeenAt - b.lastSeenAt);
	for (let i = 0; i <= mine.length - MAX_PER_USER_PER_CONVERSATION; i++) {
		set.delete(mine[i]);
		try {
			mine[i].ws.close(1008, 'too many connections');
		} catch {
			// already closing
		}
	}

	set.add(handle);

	ws.on('message', (raw) => {
		// Any inbound frame proves the client is alive, keeping it off the sweep.
		handle.lastSeenAt = Date.now();
		let parsed: unknown;
		try {
			parsed = JSON.parse(raw.toString());
		} catch {
			return;
		}
		const type = (parsed as { type?: unknown })?.type;
		if (type === 'ping') {
			if (ws.readyState === ws.OPEN)
				ws.send(JSON.stringify({ type: 'pong' } satisfies ServerEvent));
		} else if (type === 'typing') {
			broadcast(conversationId, { type: 'typing', userId, at: new Date().toISOString() }, userId);
		}
	});

	ws.on('close', () => {
		set!.delete(handle);
		if (set!.size === 0) conversations.delete(conversationId);
	});
}

/** Delivers `event` to this instance's own connections on `conversationId` except `excludeUserId`'s own. */
function deliverLocally(conversationId: string, event: ServerEvent, excludeUserId?: string): void {
	const set = conversations.get(conversationId);
	if (!set) return;
	const payload = JSON.stringify(event);
	for (const { ws, userId } of set) {
		if (userId === excludeUserId) continue;
		if (ws.readyState === ws.OPEN) ws.send(payload);
	}
}

/**
 * Sends `event` to every connection on `conversationId` except `excludeUserId`'s
 * own, on this instance and every other one (see module doc for how).
 */
export function broadcast(
	conversationId: string,
	event: ServerEvent,
	excludeUserId?: string
): void {
	deliverLocally(conversationId, event, excludeUserId);
	const envelope: BroadcastEnvelope = {
		originId: getInstanceId(),
		conversationId,
		excludeUserId,
		event
	};
	getPubSub()
		.notify(CHANNEL, JSON.stringify(envelope))
		.catch((err) => console.error('[ws] cross-instance broadcast failed:', err));
}
