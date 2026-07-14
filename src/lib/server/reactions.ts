/**
 * Emoji reactions on messages. Separate from messages.ts (like blocks.ts is
 * separate from it) - a distinct concern with its own table.
 */
import { and, eq, inArray } from 'drizzle-orm';
import { db } from './db';
import { messageReaction } from './db/schema';

/** Toggle: reacting with an emoji already present removes it instead. */
export async function toggleReaction(
	messageId: string,
	userId: string,
	emoji: string
): Promise<{ added: boolean }> {
	// Same read-decide-write toggle as setRelation: run it in a transaction with
	// a row lock so two rapid taps on the same reaction can't interleave.
	return db.transaction(async (tx) => {
		const existing = await tx
			.select({ id: messageReaction.id })
			.from(messageReaction)
			.where(
				and(
					eq(messageReaction.messageId, messageId),
					eq(messageReaction.userId, userId),
					eq(messageReaction.emoji, emoji)
				)
			)
			.for('update')
			.limit(1);

		if (existing.length > 0) {
			await tx.delete(messageReaction).where(eq(messageReaction.id, existing[0].id));
			return { added: false };
		}

		await tx.insert(messageReaction).values({ messageId, userId, emoji }).onConflictDoNothing();
		return { added: true };
	});
}

export type ReactionSummary = { emoji: string; userIds: string[] };

/** Reactions for a batch of messages, grouped by message id then by emoji. */
export async function getReactionsFor(
	messageIds: string[]
): Promise<Map<string, ReactionSummary[]>> {
	const result = new Map<string, ReactionSummary[]>();
	if (messageIds.length === 0) return result;

	const rows = await db
		.select({
			messageId: messageReaction.messageId,
			emoji: messageReaction.emoji,
			userId: messageReaction.userId
		})
		.from(messageReaction)
		.where(inArray(messageReaction.messageId, messageIds));

	for (const row of rows) {
		const forMessage = result.get(row.messageId) ?? [];
		const existing = forMessage.find((r) => r.emoji === row.emoji);
		if (existing) existing.userIds.push(row.userId);
		else forMessage.push({ emoji: row.emoji, userIds: [row.userId] });
		result.set(row.messageId, forMessage);
	}

	return result;
}
