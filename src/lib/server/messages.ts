/**
 * Minimal 1:1 messaging. One conversation per pair of users (canonical
 * ordering enforced by the `conversation` table's CHECK), plain-text
 * messages, no read receipts, no groups. Gated behind an active
 * subscription (see subscriptions.ts) at the route/endpoint layer, not
 * in here.
 */
import { and, asc, desc, eq, gt, lt, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from './db';
import { conversation, message, messageReaction } from './db/schema';

const replyMessage = alias(message, 'reply_message');

/** Messages returned per page when no explicit limit is given. */
export const DEFAULT_PAGE_SIZE = 50;

/**
 * Longest message body accepted. Keeps rows reasonable and, incidentally,
 * keeps the JSON envelope registry.ts fans out over Postgres NOTIFY well
 * under that channel's ~8000 byte payload cap.
 */
export const MAX_MESSAGE_LENGTH = 4096;

function orderedPair(userIdA: string, userIdB: string): [string, string] {
	return userIdA < userIdB ? [userIdA, userIdB] : [userIdB, userIdA];
}

/** Finds an existing conversation between the two users, if any. Doesn't create one. */
export async function findConversation(userIdA: string, userIdB: string): Promise<string | null> {
	const [a, b] = orderedPair(userIdA, userIdB);
	const [row] = await db
		.select({ id: conversation.id })
		.from(conversation)
		.where(and(eq(conversation.userAId, a), eq(conversation.userBId, b)))
		.limit(1);
	return row?.id ?? null;
}

/**
 * Creates a new conversation between the two users. Callers should check
 * the recipient's `messageable` flag first - this doesn't re-check it, so
 * an existing conversation can keep going even if that flag flips off later.
 */
export async function createConversation(userIdA: string, userIdB: string): Promise<string> {
	const [a, b] = orderedPair(userIdA, userIdB);
	const [row] = await db
		.insert(conversation)
		.values({ userAId: a, userBId: b })
		.onConflictDoNothing()
		.returning({ id: conversation.id });
	if (row) return row.id;
	// Lost a race with a concurrent insert for the same pair - look it up.
	const existing = await findConversation(a, b);
	if (!existing) throw new Error('Failed to create conversation.');
	return existing;
}

export type ConversationSummary = {
	conversationId: string;
	otherUser: { id: string; name: string; image: string | null };
	lastMessage: { body: string; senderId: string; createdAt: Date } | null;
};

/** Every conversation `userId` is part of, most recently active first. */
export async function listConversationsFor(userId: string): Promise<ConversationSummary[]> {
	const rows = await db.execute<{
		conversation_id: string;
		other_id: string;
		other_name: string;
		other_image: string | null;
		last_body: string | null;
		last_sender_id: string | null;
		last_created_at: Date | null;
	}>(sql`
		SELECT
			c.id AS conversation_id,
			CASE WHEN c.user_a_id = ${userId} THEN c.user_b_id ELSE c.user_a_id END AS other_id,
			u.name AS other_name,
			u.image AS other_image,
			lm.body AS last_body,
			lm.sender_id AS last_sender_id,
			lm.created_at AS last_created_at
		FROM "conversation" c
		JOIN "user" u ON u.id = CASE WHEN c.user_a_id = ${userId} THEN c.user_b_id ELSE c.user_a_id END
		LEFT JOIN LATERAL (
			SELECT body, sender_id, created_at
			FROM "message" m
			WHERE m.conversation_id = c.id
			ORDER BY m.created_at DESC
			LIMIT 1
		) lm ON true
		WHERE (c.user_a_id = ${userId} OR c.user_b_id = ${userId})
		  AND u.id NOT IN (
		  	SELECT blocked_id FROM "block" WHERE blocker_id = ${userId}
		  	UNION
		  	SELECT blocker_id FROM "block" WHERE blocked_id = ${userId}
		  )
		ORDER BY lm.created_at DESC NULLS LAST
	`);

	return rows.map((r) => ({
		conversationId: r.conversation_id,
		otherUser: { id: r.other_id, name: r.other_name, image: r.other_image },
		lastMessage: r.last_created_at
			? {
					body: r.last_body ?? '',
					senderId: r.last_sender_id ?? '',
					createdAt: new Date(r.last_created_at)
				}
			: null
	}));
}

export type MessageDTO = {
	id: string;
	conversationId: string;
	senderId: string;
	body: string;
	createdAt: Date;
	editedAt: Date | null;
	deletedAt: Date | null;
	replyTo: { id: string; body: string; senderId: string } | null;
};

const MESSAGE_SELECTION = {
	id: message.id,
	conversationId: message.conversationId,
	senderId: message.senderId,
	body: message.body,
	createdAt: message.createdAt,
	editedAt: message.editedAt,
	deletedAt: message.deletedAt,
	replyToId: message.replyToId,
	replyToBody: replyMessage.body,
	replyToSenderId: replyMessage.senderId
} as const;

type MessageRow = {
	id: string;
	conversationId: string;
	senderId: string;
	body: string;
	createdAt: Date;
	editedAt: Date | null;
	deletedAt: Date | null;
	replyToId: string | null;
	replyToBody: string | null;
	replyToSenderId: string | null;
};

function mapRow(r: MessageRow): MessageDTO {
	return {
		id: r.id,
		conversationId: r.conversationId,
		senderId: r.senderId,
		body: r.body,
		createdAt: r.createdAt,
		editedAt: r.editedAt,
		deletedAt: r.deletedAt,
		replyTo: r.replyToId
			? { id: r.replyToId, body: r.replyToBody!, senderId: r.replyToSenderId! }
			: null
	};
}

/**
 * Messages in a conversation, oldest first, with the quoted message resolved
 * inline for replies. Two access modes:
 *
 * - `since`: everything created strictly after the cursor, unbounded. The
 *   resync path a reconnecting client uses to catch up on a (small) gap.
 * - otherwise: the newest `limit` messages older than the optional `before`
 *   cursor. Covers the initial thread load and scroll-up backfill, and is what
 *   keeps a long conversation from loading its entire history at once. Selected
 *   newest-first to take the right end, then flipped to the ascending order the
 *   UI renders.
 */
export async function getMessages(
	conversationId: string,
	opts?: { since?: Date; before?: Date; limit?: number }
): Promise<MessageDTO[]> {
	if (opts?.since) {
		const rows = await db
			.select(MESSAGE_SELECTION)
			.from(message)
			.leftJoin(replyMessage, eq(message.replyToId, replyMessage.id))
			.where(and(eq(message.conversationId, conversationId), gt(message.createdAt, opts.since)))
			.orderBy(asc(message.createdAt));
		return rows.map(mapRow);
	}

	const conditions = [eq(message.conversationId, conversationId)];
	if (opts?.before) conditions.push(lt(message.createdAt, opts.before));

	const rows = await db
		.select(MESSAGE_SELECTION)
		.from(message)
		.leftJoin(replyMessage, eq(message.replyToId, replyMessage.id))
		.where(and(...conditions))
		.orderBy(desc(message.createdAt))
		.limit(opts?.limit ?? DEFAULT_PAGE_SIZE);

	return rows.map(mapRow).reverse();
}

export async function sendMessage(
	conversationId: string,
	senderId: string,
	body: string,
	replyToId?: string | null
): Promise<MessageDTO> {
	const [row] = await db
		.insert(message)
		.values({ conversationId, senderId, body, replyToId: replyToId ?? null })
		.returning();

	let replyTo: MessageDTO['replyTo'] = null;
	if (row.replyToId) {
		const [original] = await db
			.select({ id: message.id, body: message.body, senderId: message.senderId })
			.from(message)
			.where(eq(message.id, row.replyToId))
			.limit(1);
		if (original) replyTo = original;
	}

	return {
		id: row.id,
		conversationId: row.conversationId,
		senderId: row.senderId,
		body: row.body,
		createdAt: row.createdAt,
		editedAt: row.editedAt,
		deletedAt: row.deletedAt,
		replyTo
	};
}

export type MessageOwnership = { conversationId: string; senderId: string; deletedAt: Date | null };

/** Basic identity of a message, for authorizing edit/delete requests. */
export async function getMessageForMutation(messageId: string): Promise<MessageOwnership | null> {
	const [row] = await db
		.select({
			conversationId: message.conversationId,
			senderId: message.senderId,
			deletedAt: message.deletedAt
		})
		.from(message)
		.where(eq(message.id, messageId))
		.limit(1);
	return row ?? null;
}

/** Updates a message's body. Caller (the route handler) must already have
 *  verified ownership and length. */
export async function editMessage(messageId: string, body: string): Promise<Date> {
	const [row] = await db
		.update(message)
		.set({ body, editedAt: sql`now()` })
		.where(eq(message.id, messageId))
		.returning({ editedAt: message.editedAt });
	return row.editedAt!;
}

/** Soft-deletes a message: clears its body and reactions but keeps the row so
 *  replies quoting it still resolve. */
export async function deleteMessage(messageId: string): Promise<Date> {
	return await db.transaction(async (tx) => {
		const [row] = await tx
			.update(message)
			.set({ body: '', deletedAt: sql`now()` })
			.where(eq(message.id, messageId))
			.returning({ deletedAt: message.deletedAt });
		await tx.delete(messageReaction).where(eq(messageReaction.messageId, messageId));
		return row.deletedAt!;
	});
}

/** Deletes a conversation and all its messages (cascade). */
export async function deleteConversation(conversationId: string): Promise<void> {
	await db.delete(conversation).where(eq(conversation.id, conversationId));
}

/** Looks up a conversation by its own id (not by user pair). */
export async function getConversationById(conversationId: string) {
	const [row] = await db
		.select()
		.from(conversation)
		.where(eq(conversation.id, conversationId))
		.limit(1);
	return row ?? null;
}

/** Whether `userId` is one of the two participants in `conversationId`. */
export async function isParticipant(conversationId: string, userId: string): Promise<boolean> {
	const conv = await getConversationById(conversationId);
	if (!conv) return false;
	return conv.userAId === userId || conv.userBId === userId;
}

/** The conversation a given message belongs to, for authorizing reaction endpoints. */
export async function getMessageConversationId(messageId: string): Promise<string | null> {
	const [row] = await db
		.select({ conversationId: message.conversationId })
		.from(message)
		.where(eq(message.id, messageId))
		.limit(1);
	return row?.conversationId ?? null;
}
