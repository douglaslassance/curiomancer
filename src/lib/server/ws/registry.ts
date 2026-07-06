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

type ConnectionHandle = { ws: WebSocket; userId: string };

const REGISTRY_KEY = Symbol.for('curiomancer.ws.conversations');

function getConversations(): Map<string, Set<ConnectionHandle>> {
	const g = globalThis as unknown as { [REGISTRY_KEY]?: Map<string, Set<ConnectionHandle>> };
	if (!g[REGISTRY_KEY]) g[REGISTRY_KEY] = new Map();
	return g[REGISTRY_KEY];
}

const conversations = getConversations();

/** Registers a live connection and wires its typing pings and cleanup. */
export function registerConnection(conversationId: string, userId: string, ws: WebSocket): void {
	const handle: ConnectionHandle = { ws, userId };
	let set = conversations.get(conversationId);
	if (!set) conversations.set(conversationId, (set = new Set()));
	set.add(handle);

	ws.on('message', (raw) => {
		let parsed: unknown;
		try {
			parsed = JSON.parse(raw.toString());
		} catch {
			return;
		}
		if ((parsed as { type?: unknown })?.type === 'typing') {
			broadcast(
				conversationId,
				{ type: 'typing', userId, at: new Date().toISOString() },
				userId
			);
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
