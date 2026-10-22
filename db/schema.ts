import { pgTable, serial, integer, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
export const parlayLegs = pgTable('parlay_legs', {
  id: serial('id').primaryKey(), season: integer('season').notNull(), week: integer('week').notNull(),
  teamId: integer('team_id').notNull(), manager: text('manager').notNull(), pick: text('pick').notNull(),
  odds: text('odds'), result: text('result').notNull().default('pending'),
  sourceId: text('source_id'), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [uniqueIndex('parlay_source_id').on(t.sourceId)]);

export const notificationDevices = pgTable('notification_devices', {
  id: text('id').primaryKey(), teamId: integer('team_id'),
  permission: text('permission').notNull(), subscribed: integer('subscribed').notNull().default(0),
  installedAt: timestamp('installed_at', { withTimezone: true }),
  bellCount: integer('bell_count').notNull().default(0),
  firstSeen: timestamp('first_seen', { withTimezone: true }).notNull().defaultNow(),
  lastSeen: timestamp('last_seen', { withTimezone: true }).notNull().defaultNow(),
});
export const notificationEvents = pgTable('notification_events', {
  id: serial('id').primaryKey(), deviceId: text('device_id').notNull(), teamId: integer('team_id'),
  event: text('event').notNull(), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const tradeDigestAdditions = pgTable('trade_digest_additions', {
  id: text('id').primaryKey(), teamId: integer('team_id').notNull(),
  playerId: integer('player_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  sentAt: timestamp('sent_at', { withTimezone: true }),
});
export const tradeDigestRuns = pgTable('trade_digest_runs', {
  day: text('day').primaryKey(),
  sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
});

export const parlayWeeks = pgTable('parlay_weeks', {
  id: serial('id').primaryKey(), season: integer('season').notNull(), week: integer('week').notNull(),
  participants: text('participants').notNull().default(''), totalOdds: text('total_odds'),
}, t => [uniqueIndex('parlay_week_season').on(t.season, t.week)]);
