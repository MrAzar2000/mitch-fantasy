import { pgTable, serial, integer, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
export const parlayLegs = pgTable('parlay_legs', {
  id: serial('id').primaryKey(), season: integer('season').notNull(), week: integer('week').notNull(),
  teamId: integer('team_id').notNull(), manager: text('manager').notNull(), pick: text('pick').notNull(),
  odds: text('odds'), result: text('result').notNull().default('pending'),
  sourceId: text('source_id'), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [uniqueIndex('parlay_source_id').on(t.sourceId)]);
