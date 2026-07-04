/**
 * Minimal 1:1 messaging. One conversation per pair of users (canonical
 * ordering enforced by the `conversation` table's CHECK), plain-text
 * messages, no read receipts, no groups. Not gated behind Pro for now -
 * that's coming later.
 */
import { and, asc, eq, sql } from 'drizzle-orm';
import { db } from './db';
import { conversation, message } from './db/schema';

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

/** Every message in a conversation, oldest first. */
export function getMessages(conversationId: string) {
	return db
		.select()
		.from(message)
		.where(eq(message.conversationId, conversationId))
		.orderBy(asc(message.createdAt));
}

export async function sendMessage(conversationId: string, senderId: string, body: string) {
	const [row] = await db.insert(message).values({ conversationId, senderId, body }).returning();
	return row;
}

/** Deletes a conversation and all its messages (cascade). */
export async function deleteConversation(conversationId: string): Promise<void> {
	await db.delete(conversation).where(eq(conversation.id, conversationId));
}
