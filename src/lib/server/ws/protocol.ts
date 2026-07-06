/**
 * Wire protocol for the per-conversation realtime channel. Deliberately
 * asymmetric: the client only ever sends a typing ping. Sending a message or
 * a reaction goes through plain REST (see src/routes/api/messages and
 * src/routes/api/v1/conversations) so both web and iOS get ordinary
 * request/response semantics for writes, and this socket stays a pure
 * broadcast relay.
 */

/** Client → server. */
export type ClientEvent = { type: 'typing' };

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
	| { type: 'error'; message: string };
