import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

/**
 * A place is a shop, bar, or restaurant that users can like.
 * City is denormalized for cheap filtering in the v0; will later move
 * into its own table once we wire up the taste-matching graph.
 */
export const place = sqliteTable(
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
		createdAt: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date())
	},
	(t) => [uniqueIndex('place_name_city_idx').on(t.name, t.city)]
);

export type Place = typeof place.$inferSelect;
export type NewPlace = typeof place.$inferInsert;
