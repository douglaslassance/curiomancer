import { sql } from 'drizzle-orm';
import { doublePrecision, index, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { user } from './auth.schema';

/**
 * A place is a shop, bar, or restaurant a user has liked or wants to go to.
 *
 * Places are user-generated — the first user to like a spot creates the row,
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
		category: text('category', { enum: ['shop', 'bar', 'restaurant'] }).notNull(),
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
 *   - seen: been (or know of it) but no opinion. Zero matching signal —
 *     just tells the recommender to skip this place since the user is
 *     already aware of it.
 *   - want_to_go: haven't been but interested. Wishlist marker; no
 *     matching contribution (planned, not currently exposed in UI).
 *
 * Composite-unique on (userId, placeId) — a user only has one stance per
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
	(t) => [uniqueIndex('place_relation_user_place_idx').on(t.userId, t.placeId)]
);

export type PlaceRelation = typeof placeRelation.$inferSelect;
export type PlaceRelationKind = PlaceRelation['kind'];

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
 * Redemption is atomic via UPDATE … WHERE redeemed_by_user_id IS NULL —
 * race-safe even if the same link is clicked simultaneously.
 */
export const invite = pgTable('invite', {
	id: text('id').primaryKey(),
	createdByUserId: text('created_by_user_id')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' }),
	redeemedByUserId: text('redeemed_by_user_id').references(() => user.id, {
		onDelete: 'set null'
	}),
	createdAt: timestamp('created_at').notNull().defaultNow(),
	redeemedAt: timestamp('redeemed_at')
});

export type Invite = typeof invite.$inferSelect;

export * from './auth.schema';
