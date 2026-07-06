/**
 * In-process pub/sub for realtime conversation events. Single Node instance
 * only - no cross-instance fan-out. If Curiomancer ever runs multiple
 * replicas, replace the Map below with Postgres LISTEN/NOTIFY (the
 * `postgres` client already used in db/index.ts supports sql.listen()) -
 * `broadcast` is the one seam that would need to change, call sites wouldn't.
 *
 * This module is loaded twice in this process under two different module
 * graphs: once as plain source via tsx (server.ts / ws/upgrade.ts) and once
 * bundled into the Vite SSR output (imported by +server.ts route handlers
 * that call `broadcast` after writing a message/reaction). Two module
 * instances would mean two different Maps, so registerConnection and
 * broadcast would silently talk past each other. Symbol.for gives both
 * copies the same slot on `globalThis`, so there's exactly one Map either
 * way.
 */
import type { WebSocket } from 'ws';
import type { ServerEvent } from './protocol';

type ConnectionHandle = { ws: WebSocket; userId: string; lastSeenAt: number };

const REGISTRY_KEY = Symbol.for('curiomancer.ws.conversations');
const SWEEP_KEY = Symbol.for('curiomancer.ws.sweep');

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

/** Registers a live connection and wires its inbound events and cleanup. */
export function registerConnection(conversationId: string, userId: string, ws: WebSocket): void {
	ensureSweep();
	const handle: ConnectionHandle = { ws, userId, lastSeenAt: Date.now() };
	let set = conversations.get(conversationId);
	if (!set) conversations.set(conversationId, (set = new Set()));
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
			if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: 'pong' } satisfies ServerEvent));
		} else if (type === 'typing') {
			broadcast(conversationId, { type: 'typing', userId, at: new Date().toISOString() }, userId);
		}
	});

	ws.on('close', () => {
		set!.delete(handle);
		if (set!.size === 0) conversations.delete(conversationId);
	});
}

/** Sends `event` to every connection on `conversationId` except `excludeUserId`'s own. */
export function broadcast(conversationId: string, event: ServerEvent, excludeUserId?: string): void {
	const set = conversations.get(conversationId);
	if (!set) return;
	const payload = JSON.stringify(event);
	for (const { ws, userId } of set) {
		if (userId === excludeUserId) continue;
		if (ws.readyState === ws.OPEN) ws.send(payload);
	}
}
