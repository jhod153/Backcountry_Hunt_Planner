import { pgTable, text, uuid, jsonb, integer, timestamp, primaryKey } from 'drizzle-orm/pg-core';
export const plans = pgTable('hunt_plans', {
  id: uuid().primaryKey().defaultRandom(),
  ownerId: text('owner_id').notNull(),
  name: text().notNull(),
  data: jsonb().notNull(),
  version: integer().notNull().default(1),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
export const collaborators = pgTable('hunt_collaborators', {
  planId: uuid('plan_id').notNull().references(() => plans.id, { onDelete: 'cascade' }),
  email: text().notNull(),
}, t => [primaryKey({ columns: [t.planId, t.email] })]);
