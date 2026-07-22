import { eq } from 'drizzle-orm';
import { error, json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { placeRelation, user } from '$lib/server/db/schema';
import { requireApiUser } from '$lib/server/api-auth';
import { getUserLocation } from '$lib/server/current-location';
import { getInvitesFor } from '$lib/server/invites';
import { listApiTokens } from '$lib/server/api-tokens';
import { isSubscriber } from '$lib/server/subscriptions';
import { getOrCreateMapShareToken } from '$lib/server/map-share';
import { getPostHogClient } from '$lib/server/posthog';
import type { RequestHandler } from './$types';

/**
 * GET /api/v1/account
 *
 * The viewer's own private account, mirroring the /settings load. This is the
 * one surface that returns email, role, invites, and the list of API tokens -
 * strictly the token owner's own data, never anyone else's. Distinct from
 * /api/v1/users/:id, which is the public profile view.
 *
 *   returns: {
 *     profile: { id, name, email, role, image, incognito },
 *     location, ratingCount, isSubscriber, invites, apiTokens, mapShareToken
 *   }
 *
 * `mapShareToken` backs the native "share your likes" action: the client builds
 * `/s/<token>` from it. `incognito` mirrors the /settings privacy toggle.
 */
export const GET: RequestHandler = async ({ request }) => {
	const userId = await requireApiUser(request);

	const [[profile], location, ratings, invites, apiTokens, subscriber, mapShareToken] =
		await Promise.all([
			db
				.select({
					id: user.id,
					name: user.name,
					email: user.email,
					role: user.role,
					image: user.image,
					incognito: user.incognito
				})
				.from(user)
				.where(eq(user.id, userId))
				.limit(1),
			getUserLocation(userId),
			db
				.select({ id: placeRelation.id })
				.from(placeRelation)
				.where(eq(placeRelation.userId, userId)),
			getInvitesFor(userId),
			listApiTokens(userId),
			isSubscriber(userId),
			getOrCreateMapShareToken(userId)
		]);

	if (!profile) throw error(404, 'Account not found');

	return json({
		profile: {
			id: profile.id,
			name: profile.name,
			email: profile.email,
			role: profile.role ?? 'user',
			image: profile.image ?? null,
			incognito: profile.incognito ?? false
		},
		location: location ?? null,
		// Every place_relation kind counts as a rating (liked/disliked/seen/
		// want_to_go), matching the web /settings `ratingCount`. Not a like count.
		ratingCount: ratings.length,
		isSubscriber: subscriber,
		invites,
		apiTokens,
		mapShareToken
	});
};

/**
 * PATCH /api/v1/account
 *
 * Update the token owner's own basic profile from a native client. Only the
 * fields safe to change with a personal access token (no better-auth session)
 * are accepted: display name and the incognito toggle. Email, password, and
 * avatar stay web-only, where a real signed-in browser session makes the
 * change. Every field is optional; send just the one you're changing.
 *
 *   body: { name?: string, incognito?: boolean }
 *   returns: { name, incognito }
 */
export const PATCH: RequestHandler = async ({ request }) => {
	const userId = await requireApiUser(request);

	const body = (await request.json().catch(() => null)) as {
		name?: unknown;
		incognito?: unknown;
	} | null;
	if (!body) throw error(400, 'Expected a JSON body.');

	const updates: { name?: string; incognito?: boolean } = {};

	if (body.name !== undefined) {
		if (typeof body.name !== 'string') throw error(400, 'Name must be a string.');
		const name = body.name.trim();
		if (!name) throw error(400, 'Name cannot be empty.');
		if (name.length > 100) throw error(400, 'Name is too long.');
		updates.name = name;
	}

	if (body.incognito !== undefined) {
		if (typeof body.incognito !== 'boolean') throw error(400, 'Incognito must be true or false.');
		updates.incognito = body.incognito;
	}

	if (Object.keys(updates).length === 0) throw error(400, 'Nothing to update.');

	const [updated] = await db
		.update(user)
		.set(updates)
		.where(eq(user.id, userId))
		.returning({ name: user.name, incognito: user.incognito });

	if (!updated) throw error(404, 'Account not found');

	getPostHogClient()?.capture({
		distinctId: userId,
		event: 'profile_updated',
		properties: { fields: Object.keys(updates), source: 'api' }
	});

	return json({ name: updated.name, incognito: updated.incognito ?? false });
};
