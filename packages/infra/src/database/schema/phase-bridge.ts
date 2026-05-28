import { jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Phase Bridge 事件存档（事件总线持久化）。
 * 含 idempotencyKey 防重复消费、causationId 串链。
 * @stability S2
 */
export const phaseBridgeEvents = pgTable('phase_bridge_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: text('tenant_id').notNull(),
  source: text('source').notNull(),
  target: text('target'),
  type: text('type').notNull(),
  payload: jsonb('payload').notNull(),
  correlationId: text('correlation_id').notNull(),
  causationId: text('causation_id').notNull(),
  idempotencyKey: text('idempotency_key').notNull().unique(),
  schemaVersion: text('schema_version').notNull().default('1.0'),
  actor: jsonb('actor').notNull(),
  dataClassification: text('data_classification').notNull().default('internal'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
