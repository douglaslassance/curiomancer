import { doublePrecision, index, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { user } from './auth.schema';

/**
 * A place is a shop, bar, or restaurant that users can like.
 * City is denormalized for cheap filtering in the v0; will later move
 * into its own table once we wire up the taste-matching graph.
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
		createdAt: timestamp('created_at').notNull().defaultNow()
	},
	(t) => [uniqueIndex('place_name_city_idx').on(t.name, t.city), index('place_city_idx').on(t.city)]
);

export type Place = typeof place.$inferSelect;
export type NewPlace = typeof place.$inferInsert;

/**
 * A like joins a user to a place. Composite-unique on (userId, placeId)
 * so a user can't double-like the same place.
 */
export const like = pgTable(
	'like',
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
		createdAt: timestamp('created_at').notNull().defaultNow()
	},
	(t) => [uniqueIndex('like_user_place_idx').on(t.userId, t.placeId)]
);

export type Like = typeof like.$inferSelect;

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

export * from './auth.schema';
