/**
 * Production entrypoint, replacing adapter-node's own `build/index.js`.
 * adapter-node has no config knob to skip its own auto-`.listen()`, so the
 * only way to attach a WebSocket server is to own the HTTP server ourselves:
 * mount the built SvelteKit handler for normal requests, and intercept the
 * raw `'upgrade'` event for the realtime conversation channel before it ever
 * reaches SvelteKit's routing.
 *
 * Run via `tsx` (see package.json's `start` script) so this file and
 * src/lib/server/ws/* stay plain TypeScript, type-checked like the rest of
 * the app, without needing a separate build step.
 *
 * Owning the HTTP server (and holding sockets in memory) commits Curiomancer
 * to a single long-lived stateful process. That rules out serverless/edge
 * targets (Workers, Vercel functions), where realtime would instead need
 * Durable Objects or a hosted pub/sub. Multiple instances of this process are
 * fine, though: registry.ts fans broadcasts out across instances via Postgres
 * LISTEN/NOTIFY, so two participants in a conversation can land on different
 * instances and still reach each other.
 */
import { createServer } from 'node:http';
import { handler } from './build/handler.js';
import { WebSocketServer } from 'ws';
import { handleUpgrade } from './src/lib/server/ws/upgrade';

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? '0.0.0.0';

const server = createServer((req, res) => {
	handler(req, res, () => {
		res.statusCode = 404;
		res.end('Not found');
	});
});

// noServer: true - handleUpgrade decides per-request whether this is our
// route and who's authorized before ws touches the connection at all.
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
	handleUpgrade(req, socket, head, wss).catch((err) => {
		console.error('[ws] upgrade failed:', err);
		socket.destroy();
	});
});

server.listen(PORT, HOST, () => {
	console.log(`Listening on http://${HOST}:${PORT}`);
});

let shuttingDown = false;
for (const sig of ['SIGTERM', 'SIGINT'] as const) {
	process.on(sig, () => {
		if (shuttingDown) return;
		shuttingDown = true;
		// Close live sockets first so they don't keep server.close() waiting, then
		// stop accepting connections. A forced-exit timer guarantees the process
		// still exits if some connection stalls its close.
		wss.clients.forEach((ws) => ws.close(1001, 'server shutting down'));
		server.close(() => process.exit(0));
		setTimeout(() => process.exit(1), 10_000).unref();
	});
}
