import { pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
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
		category: text('category', {
			enum: ['shop', 'bar', 'restaurant']
		}).notNull(),
		city: text('city').notNull(),
		neighborhood: text('neighborhood'),
		description: text('description').notNull(),
		createdAt: timestamp('created_at').notNull().defaultNow()
	},
	(t) => [uniqueIndex('place_name_city_idx').on(t.name, t.city)]
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

export * from './auth.schema';
