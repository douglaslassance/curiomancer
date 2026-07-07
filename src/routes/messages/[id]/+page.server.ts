import { error, fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { user } from '$lib/server/db/schema';
import { isBlocked } from '$lib/server/blocks';
import { getPairScore } from '$lib/server/matching';
import {
	createConversation,
	DEFAULT_PAGE_SIZE,
	findConversation,
	getMessages,
	MAX_MESSAGE_LENGTH,
	sendMessage
} from '$lib/server/messages';
import { getReactionsFor } from '$lib/server/reactions';
import { toMessagePayload } from '$lib/server/ws/protocol';
import { broadcast } from '$lib/server/ws/registry';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!locals.user) throw redirect(302, `/sign-in?next=/messages/${params.id}`);
	if (locals.user.id === params.id) throw error(400, "You can't message yourself.");

	const [other] = await db
		.select({ id: user.id, name: user.name, image: user.image, messageable: user.messageable })
		.from(user)
		.where(eq(user.id, params.id))
		.limit(1);
	if (!other) throw error(404, 'User not found');

	if (await isBlocked(locals.user.id, params.id)) throw error(404, 'User not found');

	// Same signed-similarity score shown everywhere else (people list, profile),
	// so the ring around their avatar here never disagrees with those.
	const pair = await getPairScore(locals.user.id, params.id);

	const existingId = await findConversation(locals.user.id, params.id);
	if (!existingId && !other.messageable) {
		return {
			other,
			score: pair.score,
			conversationId: null,
			messages: [],
			reactionsByMessage: {},
			hasMore: false,
			unavailable: true as const,
			maxMessageLength: MAX_MESSAGE_LENGTH
		};
	}

	const conversationId = existingId ?? (await createConversation(locals.user.id, params.id));
	// Just the latest page; the client backfills older messages on scroll-up.
	const messages = await getMessages(conversationId, { limit: DEFAULT_PAGE_SIZE });
	const reactionsByMessage = Object.fromEntries(await getReactionsFor(messages.map((m) => m.id)));
	return {
		other,
		score: pair.score,
		conversationId,
		messages,
		reactionsByMessage,
		hasMore: messages.length === DEFAULT_PAGE_SIZE,
		unavailable: false as const,
		maxMessageLength: MAX_MESSAGE_LENGTH
	};
};

export const actions: Actions = {
	send: async ({ request, params, locals }) => {
		if (!locals.user) return fail(401, { error: 'Sign in first.' });
		if (await isBlocked(locals.user.id, params.id)) {
			return fail(403, { error: 'This conversation is unavailable.' });
		}

		const data = await request.formData();
		const body = data.get('body')?.toString().trim() ?? '';
		if (!body) return fail(400, { error: 'Message is empty.' });
		if (body.length > MAX_MESSAGE_LENGTH) {
			return fail(400, { error: `Message is too long (max ${MAX_MESSAGE_LENGTH} characters).` });
		}
		const replyToId = data.get('replyToId')?.toString().trim() || null;

		const existingId = await findConversation(locals.user.id, params.id);
		if (!existingId) {
			const [recipient] = await db
				.select({ messageable: user.messageable })
				.from(user)
				.where(eq(user.id, params.id))
				.limit(1);
			if (!recipient?.messageable) {
				return fail(403, { error: "This person isn't accepting messages right now." });
			}
		}

		const conversationId = existingId ?? (await createConversation(locals.user.id, params.id));
		const created = await sendMessage(conversationId, locals.user.id, body, replyToId);
		broadcast(conversationId, { type: 'message:new', message: toMessagePayload(created) });
		return { sent: true };
	}
};
