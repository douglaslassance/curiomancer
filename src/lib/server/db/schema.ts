import { sql } from 'drizzle-orm';
import {
	type AnyPgColumn,
	boolean,
	check,
	date,
	doublePrecision,
	index,
	integer,
	pgTable,
	primaryKey,
	text,
	timestamp,
	uniqueIndex
} from 'drizzle-orm/pg-core';
import { user } from './auth.schema';

/**
 * A place is a shop, bar, or restaurant a user has liked or wants to go to.
 *
 * Places are user-generated - the first user to like a spot creates the row,
 * everyone after them likes the same row. We dedupe by external provider id
 * (`source` + `external_id`) so two users adding "Bestia" from Apple Maps
 * end up on the same row, but a manual entry without an external id stays
 * distinct (two different actual businesses can share a name).
 */
export const place = pgTable(
	'place',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		name: text('name').notNull(),
		category: text('category', { enum: ['eat', 'drink', 'shop', 'visit'] }).notNull(),
		city: text('city').notNull(),
		neighborhood: text('neighborhood'),
		description: text('description').notNull(),
		latitude: doublePrecision('latitude'),
		longitude: doublePrecision('longitude'),
		/** Where this place came from: 'apple' (MapKit), 'seed' (demo fixture), 'manual' (user-typed). */
		source: text('source', { enum: ['apple', 'seed', 'manual'] })
			.notNull()
			.default('manual'),
		/** The provider's stable id, e.g. Apple's muid. Nullable for manual entries. */
		externalId: text('external_id'),
		createdAt: timestamp('created_at').notNull().defaultNow()
	},
	(t) => [
		// Dedupe across users for provider-sourced places.
		uniqueIndex('place_source_external_idx')
			.on(t.source, t.externalId)
			.where(sql`${t.externalId} IS NOT NULL`),
		index('place_city_idx').on(t.city)
	]
);

export type Place = typeof place.$inferSelect;
export type NewPlace = typeof place.$inferInsert;

/**
 * A user's stance on a place. Four mutually-exclusive kinds:
 *
 *   - liked: been, dig it. Strong positive signal for matching.
 *   - disliked: been, don't dig it. Strong negative signal for matching.
 *   - seen: been (or know of it) but no opinion. Zero matching signal -
 *     just tells the recommender to skip this place since the user is
 *     already aware of it.
 *   - want_to_go: haven't been but interested. Wishlist marker; no
 *     matching contribution (planned, not currently exposed in UI).
 *
 * Composite-unique on (userId, placeId) - a user only has one stance per
 * place at a time. Changing your mind overwrites the prior row.
 *
 * Historically this table was called `like`. Renamed when dislikes were
 * added so the name matches the concept.
 */
export const placeRelation = pgTable(
	'place_relation',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		placeId: text('place_id')
			.notNull()
			.references(() => place.id, { onDelete: 'cascade' }),
		kind: text('kind', { enum: ['liked', 'disliked', 'seen', 'want_to_go'] })
			.notNull()
			.default('liked'),
		createdAt: timestamp('created_at').notNull().defaultNow()
	},
	(t) => [
		uniqueIndex('place_relation_user_place_idx').on(t.userId, t.placeId),
		// The composite above serves userId-prefixed lookups, but place-popup
		// like-counts query by placeId alone; without this they seq-scan the
		// core table.
		index('place_relation_place_idx').on(t.placeId)
	]
);

export type PlaceRelation = typeof placeRelation.$inferSelect;
export type PlaceRelationKind = PlaceRelation['kind'];

/**
 * Records the first time a place was surfaced to a user as a recommendation
 * (home rails, not search/browse). Unique on (userId, placeId) - we
 * track first exposure, not every render, so repeat home loads don't
 * inflate impression counts. `reason` captures why it was recommended: an
 * algorithmic taste-twin liked it, or (cold start) it was popular in the
 * city with no personalization involved.
 *
 * Because recommendation queries already exclude places the user has any
 * relation with, a later `liked` row for the same pair necessarily postdates
 * the impression - conversion is a plain existence check, no timestamp
 * comparison needed.
 */
export const recommendationImpression = pgTable(
	'recommendation_impression',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		placeId: text('place_id')
			.notNull()
			.references(() => place.id, { onDelete: 'cascade' }),
		reason: text('reason', { enum: ['twin_match', 'popular_fallback'] }).notNull(),
		shownAt: timestamp('shown_at').notNull().defaultNow()
	},
	(t) => [uniqueIndex('recommendation_impression_user_place_idx').on(t.userId, t.placeId)]
);

export type RecommendationImpression = typeof recommendationImpression.$inferSelect;
export type RecommendationReason = RecommendationImpression['reason'];

/**
 * Time-bounded happenings (concerts, openings, screenings, markets).
 * Distinct from places because events have a start/end time and
 * usually live at a venue rather than being the venue themselves.
 */
export const event = pgTable(
	'event',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		name: text('name').notNull(),
		category: text('category', {
			enum: ['music', 'art', 'food', 'film', 'sports', 'community']
		}).notNull(),
		city: text('city').notNull(),
		venue: text('venue'),
		description: text('description').notNull(),
		startsAt: timestamp('starts_at').notNull(),
		endsAt: timestamp('ends_at'),
		createdAt: timestamp('created_at').notNull().defaultNow()
	},
	(t) => [index('event_city_starts_idx').on(t.city, t.startsAt)]
);

export type Event = typeof event.$inferSelect;
export type NewEvent = typeof event.$inferInsert;

/**
 * Where the user is *right now*, not where they live. Updated when the
 * browser geolocates or the user manually picks a city. One row per user
 * (userId is PK), so we always have at most one current location.
 *
 * Kept separate from the better-auth-managed `user` table so the auth
 * schema stays untouched and we can iterate on location independently.
 */
export const userLocation = pgTable('user_location', {
	userId: text('user_id')
		.primaryKey()
		.references(() => user.id, { onDelete: 'cascade' }),
	city: text('city').notNull(),
	countryCode: text('country_code'),
	latitude: doublePrecision('latitude').notNull(),
	longitude: doublePrecision('longitude').notNull(),
	timezone: text('timezone'),
	updatedAt: timestamp('updated_at').notNull().defaultNow()
});

export type UserLocation = typeof userLocation.$inferSelect;
export type NewUserLocation = typeof userLocation.$inferInsert;

/**
 * Invite-only signup tokens. Each user is created with a small number of
 * these (currently 3); the code itself is the primary key so URLs like
 * /sign-up?invite=ABCD-EFGH-IJKL go straight to a row lookup.
 *
 * Redemption is atomic via UPDATE … WHERE redeemed_by_user_id IS NULL -
 * race-safe even if the same link is clicked simultaneously.
 */
export const invite = pgTable('invite', {
	id: text('id').primaryKey(),
	// Who created the invite. A real user when they invite a friend (or an admin
	// creating one by hand) - their name personalises the email and it counts
	// against their `invite_limit`. NULL means the system created it (a waitlist
	// admit). On that account's deletion it falls back to NULL rather than
	// destroying a live, possibly-unredeemed invite.
	createdByUserId: text('created_by_user_id').references(() => user.id, {
		onDelete: 'set null'
	}),
	// The email we sent the invite to (the friend being invited, or the waitlist
	// entry's email). NULL only for legacy codes with no recorded recipient.
	invitedEmail: text('invited_email'),
	redeemedByUserId: text('redeemed_by_user_id').references(() => user.id, {
		onDelete: 'set null'
	}),
	createdAt: timestamp('created_at').notNull().defaultNow(),
	redeemedAt: timestamp('redeemed_at')
});

export type Invite = typeof invite.$inferSelect;

/**
 * Directed block: `blockerId` no longer wants to see or be seen by
 * `blockedId`. Effects are symmetric even though only one side created the
 * row - both parties disappear from each other's twins/nearby/profile/
 * messaging surfaces, and blocked users are excluded from each other's
 * recommendation pool. Composite PK prevents duplicates; the CHECK
 * prevents self-blocks.
 */
export const block = pgTable(
	'block',
	{
		blockerId: text('blocker_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		blockedId: text('blocked_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		createdAt: timestamp('created_at').notNull().defaultNow()
	},
	(t) => [
		primaryKey({ columns: [t.blockerId, t.blockedId] }),
		check('block_no_self', sql`${t.blockerId} <> ${t.blockedId}`),
		index('block_blocked_idx').on(t.blockedId)
	]
);

export type Block = typeof block.$inferSelect;

/**
 * A 1:1 conversation between two users. `userAId` is always the
 * lexicographically smaller of the pair's ids (enforced by the CHECK) so a
 * given pair maps to exactly one row no matter who started it - finding an
 * existing conversation is a single lookup, not an OR across both orderings.
 * Callers must sort the pair before insert/lookup ($lib/server/messages.ts).
 */
export const conversation = pgTable(
	'conversation',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		userAId: text('user_a_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		userBId: text('user_b_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		createdAt: timestamp('created_at').notNull().defaultNow()
	},
	(t) => [
		uniqueIndex('conversation_pair_idx').on(t.userAId, t.userBId),
		// The pair index serves the userAId side; the inbox query filters
		// `userAId = ? OR userBId = ?`, so the userBId half needs its own index.
		index('conversation_user_b_idx').on(t.userBId),
		check('conversation_ordered_pair', sql`${t.userAId} < ${t.userBId}`)
	]
);

export type Conversation = typeof conversation.$inferSelect;

/** One message in a conversation. Plain text only for this first version. */
export const message = pgTable(
	'message',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		conversationId: text('conversation_id')
			.notNull()
			.references(() => conversation.id, { onDelete: 'cascade' }),
		senderId: text('sender_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		body: text('body').notNull(),
		/**
		 * The message this one is replying to, if any. `set null` (not cascade):
		 * deleting the original should orphan the quote, not delete the reply
		 * that responds to it - same convention as invite.redeemedByUserId.
		 */
		replyToId: text('reply_to_id').references((): AnyPgColumn => message.id, {
			onDelete: 'set null'
		}),
		createdAt: timestamp('created_at').notNull().defaultNow(),
		editedAt: timestamp('edited_at'),
		/**
		 * Soft-delete marker. The row stays (so replies quoting it still resolve
		 * and its id stays valid) but `body` is cleared to '' at the same time
		 * this is set - see deleteMessage in messages.ts.
		 */
		deletedAt: timestamp('deleted_at')
	},
	(t) => [
		index('message_conversation_created_idx').on(t.conversationId, t.createdAt),
		index('message_reply_to_idx').on(t.replyToId)
	]
);

export type Message = typeof message.$inferSelect;

/**
 * A user's emoji reaction to a message. Unique on (messageId, userId, emoji) -
 * not (messageId, userId) - so one person can react with several different
 * emoji on the same message. Toggle semantics (posting the same emoji again
 * removes it) live in the endpoint, not the constraint.
 */
export const messageReaction = pgTable(
	'message_reaction',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		messageId: text('message_id')
			.notNull()
			.references(() => message.id, { onDelete: 'cascade' }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		emoji: text('emoji').notNull(),
		createdAt: timestamp('created_at').notNull().defaultNow()
	},
	(t) => [
		uniqueIndex('message_reaction_message_user_emoji_idx').on(t.messageId, t.userId, t.emoji),
		index('message_reaction_message_idx').on(t.messageId)
	]
);

export type MessageReaction = typeof messageReaction.$inferSelect;

/**
 * Personal access tokens for the public API. Lets a user pull their own
 * taste data (likes, location) out of Curiomancer to plug into other
 * services - the "your taste belongs to you" promise.
 *
 * We store only a SHA-256 hash of the token; the plaintext is shown to
 * the user exactly once at creation. `tokenPrefix` keeps the first few
 * visible characters so a user can tell their tokens apart in the list.
 */
export const apiToken = pgTable(
	'api_token',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		tokenHash: text('token_hash').notNull().unique(),
		tokenPrefix: text('token_prefix').notNull(),
		createdAt: timestamp('created_at').notNull().defaultNow(),
		lastUsedAt: timestamp('last_used_at')
	},
	(t) => [index('api_token_user_idx').on(t.userId)]
);

export type ApiToken = typeof apiToken.$inferSelect;

/**
 * Capability link for the "share my likes" map. The token is an unguessable
 * secret, deliberately NOT the user id (which is an identifier that shows up
 * in profile URLs, the people list, and the API), so the link is viewable by
 * anyone who has it but can't be discovered by guessing or enumerating ids.
 * One stable row per user; rotating the link just replaces the token.
 */
export const mapShare = pgTable('map_share', {
	token: text('token').primaryKey(),
	userId: text('user_id')
		.notNull()
		.unique()
		.references(() => user.id, { onDelete: 'cascade' }),
	createdAt: timestamp('created_at').notNull().defaultNow()
});

export type MapShare = typeof mapShare.$inferSelect;

/**
 * "Skip" on the Tune queue - the low-commitment "not now" (no rating given).
 * Deliberately NOT a place_relation: a skip carries no taste signal and must
 * not touch matching. Drives a backing-off cooldown so a skipped place is
 * hidden for a while, resurfaces later, and retires after enough skips (see
 * tune.ts). Rows point at either an in-DB place (`placeId`) or a raw Apple POI
 * not yet saved (`externalId` = Apple muid); at most one of the two is set.
 */
export const tuneSkip = pgTable(
	'tune_skip',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		placeId: text('place_id').references(() => place.id, { onDelete: 'cascade' }),
		externalId: text('external_id'),
		count: integer('count').notNull().default(1),
		lastSkippedAt: timestamp('last_skipped_at').notNull().defaultNow()
	},
	(t) => [index('tune_skip_user_idx').on(t.userId)]
);

export type TuneSkip = typeof tuneSkip.$inferSelect;

/**
 * Public waitlist. Anyone can join with an email (and optionally their
 * home city, which helps us batch-admit by geography for density). An
 * admin later admits an entry, which mints an invite code linked here;
 * the admitted person then signs up with that code and gets their own
 * invites to spread further.
 */
export const waitlist = pgTable('waitlist', {
	id: text('id')
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	email: text('email').notNull().unique(),
	city: text('city'),
	/** Geocoded from `city` at signup, best-effort, for the waitlist map. */
	latitude: doublePrecision('latitude'),
	longitude: doublePrecision('longitude'),
	status: text('status', { enum: ['pending', 'invited'] })
		.notNull()
		.default('pending'),
	/** The invite code minted when this entry was admitted; null while pending. */
	inviteId: text('invite_id').references(() => invite.id, { onDelete: 'set null' }),
	createdAt: timestamp('created_at').notNull().defaultNow(),
	invitedAt: timestamp('invited_at')
});

export type Waitlist = typeof waitlist.$inferSelect;

/**
 * A paid subscription. There is a single subscription (no tiers). We snapshot
 * the monthly price on the row (`priceCents`) so MRR is computed from the
 * subscription itself and stays correct if the list price ever changes. Rows
 * are created by the Stripe webhook (real subscriptions) or by admin grants
 * (comps); Stripe linkage lives in the stripe* columns below.
 *
 * Subscriber counts and MRR over time are reconstructable from `createdAt`
 * and `canceledAt`, so they never need a daily snapshot: a subscription is
 * "active on day D" when createdAt <= D and (canceledAt IS NULL OR canceledAt > D).
 */
export const subscription = pgTable(
	'subscription',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		status: text('status', { enum: ['active', 'canceled'] })
			.notNull()
			.default('active'),
		/** Monthly price in cents captured at signup. Currently $4.99. */
		priceCents: integer('price_cents').notNull().default(499),
		/**
		 * Stripe linkage. All null for admin-granted comps; populated for rows
		 * created from a real Stripe subscription via the webhook. The customer
		 * id persists across resubscribes so we reuse one Stripe customer per
		 * user, and backs the "manage subscription" Customer Portal link.
		 */
		stripeCustomerId: text('stripe_customer_id'),
		stripeSubscriptionId: text('stripe_subscription_id').unique(),
		/** End of the current paid period, mirrored from Stripe for display. */
		currentPeriodEnd: timestamp('current_period_end'),
		/** True when the subscription is set to end at currentPeriodEnd instead of renewing. */
		cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
		createdAt: timestamp('created_at').notNull().defaultNow(),
		canceledAt: timestamp('canceled_at')
	},
	(t) => [
		index('subscription_user_idx').on(t.userId),
		index('subscription_status_idx').on(t.status)
	]
);

export type Subscription = typeof subscription.$inferSelect;

/**
 * Last-seen heartbeat per user, kept out of the better-auth `user` table (like
 * `userLocation`) so the auth schema stays generated/untouched. Updated from
 * the request hook, throttled in-process so it's at most one write per user
 * every few minutes. Only stores the *latest* seen time, which is why active
 * counts for past days are captured into `metricSnapshot` daily - you can't
 * recover "who was active last Tuesday" from a single overwriting column.
 */
export const userActivity = pgTable('user_activity', {
	userId: text('user_id')
		.primaryKey()
		.references(() => user.id, { onDelete: 'cascade' }),
	lastSeenAt: timestamp('last_seen_at').notNull().defaultNow()
});

export type UserActivity = typeof userActivity.$inferSelect;

/**
 * One row per UTC day of point-in-time metrics that cannot be reconstructed
 * after the fact - currently just active-user counts. Signups and subscribers
 * are derived on the fly from their source tables, so they are deliberately
 * NOT stored here. The daily cron upserts today's row (idempotent on `day`).
 */
export const metricSnapshot = pgTable('metric_snapshot', {
	day: date('day').primaryKey(),
	/** DAU: distinct users seen in the trailing 24h as of capture. */
	activeDay: integer('active_day').notNull().default(0),
	/** WAU: trailing 7 days. */
	activeWeek: integer('active_week').notNull().default(0),
	/** MAU: trailing 30 days. */
	activeMonth: integer('active_month').notNull().default(0),
	createdAt: timestamp('created_at').notNull().defaultNow()
});

export type MetricSnapshot = typeof metricSnapshot.$inferSelect;

export * from './auth.schema';
