/**
 * Raw HTTP `upgrade` handler for the conversation WS channel, run by
 * server.ts via tsx - entirely outside SvelteKit's Vite/hooks pipeline.
 *
 * That matters: src/lib/server/auth.ts and messages.ts transitively import
 * SvelteKit virtual modules ($env/dynamic/private, $app/server), which only
 * resolve inside a Vite/SvelteKit build - tsx running this file as plain
 * source cannot import them directly. Rather than duplicate or route around
 * that auth logic, this handler makes a loopback HTTP call to a normal
 * SvelteKit endpoint (api/internal/ws-auth) that runs through the built
 * handler and therefore has hooks.server.ts's locals.user and every other
 * import working exactly as it does for a real request - same auth code
 * path as everything else, no special-casing.
 */
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import type { WebSocketServer } from 'ws';
import { registerConnection } from './registry';

const PATH_PATTERN = /^\/ws\/conversations\/([^/]+)$/;
const PORT = process.env.PORT ?? '3000';

function rejectSocket(socket: Duplex, status: number, message: string): void {
	socket.write(`HTTP/1.1 ${status} ${message}\r\nConnection: close\r\n\r\n`);
	socket.destroy();
}

export async function handleUpgrade(
	req: IncomingMessage,
	socket: Duplex,
	head: Buffer,
	wss: WebSocketServer
): Promise<void> {
	const url = new URL(req.url ?? '/', 'http://internal');
	const match = url.pathname.match(PATH_PATTERN);
	if (!match) {
		rejectSocket(socket, 404, 'Not Found');
		return;
	}
	const conversationId = match[1];

	const authRes = await fetch(
		`http://127.0.0.1:${PORT}/api/internal/ws-auth?conversationId=${encodeURIComponent(conversationId)}`,
		{
			headers: {
				cookie: req.headers.cookie ?? '',
				authorization: req.headers.authorization ?? ''
			}
		}
	);
	if (!authRes.ok) {
		rejectSocket(socket, authRes.status, authRes.status === 403 ? 'Forbidden' : 'Unauthorized');
		return;
	}
	const { userId } = (await authRes.json()) as { userId: string };

	wss.handleUpgrade(req, socket, head, (ws) => {
		wss.emit('connection', ws, req);
		registerConnection(conversationId, userId, ws);
	});
}
