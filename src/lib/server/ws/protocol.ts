/**
 * Wire protocol for the per-conversation realtime channel. Deliberately
 * asymmetric: the client only ever sends a typing notice or a liveness ping.
 * Sending a message or a reaction goes through plain REST (see
 * src/routes/api/messages and src/routes/api/v1/conversations) so both web and
 * iOS get ordinary request/response semantics for writes, and this socket
 * stays a pure broadcast relay.
 *
 * Liveness runs at the application layer (a `ping`/`pong` data-message pair)
 * rather than on native WebSocket ping frames, because a browser client can't
 * send native ping frames from JavaScript. Doing it in-band means both the web
 * and iOS clients detect a half-open socket the same way.
 */

/** Client → server. */
export type ClientEvent = { type: 'typing' } | { type: 'ping' };

export type MessageEventPayload = {
	id: string;
	conversationId: string;
	senderId: string;
	body: string;
	createdAt: string;
	replyTo: { id: string; body: string; senderId: string } | null;
};

/** Server → client. */
export type ServerEvent =
	| { type: 'message:new'; message: MessageEventPayload }
	| { type: 'reaction:added'; messageId: string; userId: string; emoji: string }
	| { type: 'reaction:removed'; messageId: string; userId: string; emoji: string }
	| { type: 'typing'; userId: string; at: string }
	| { type: 'pong' }
	| { type: 'error'; message: string };

/**
 * Application-defined close codes (RFC 6455 reserves 4000-4999 for apps).
 * Unlike an HTTP-level upgrade rejection, which a browser's WebSocket API
 * surfaces only as an opaque 1006 (indistinguishable from a network drop),
 * a close code sent after a completed handshake is readable on the client's
 * `close` event. That lets the client tell "authorization was refused, stop
 * retrying" from "transient blip, reconnect". See ws/upgrade.ts (sender) and
 * conversation.svelte.ts (reader).
 */
export const WS_CLOSE_UNAUTHORIZED = 4401;
export const WS_CLOSE_FORBIDDEN = 4403;
