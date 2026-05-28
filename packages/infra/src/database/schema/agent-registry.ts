import { boolean, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Agent 注册定义。每条记录代表一个 Agent 的版本快照。
 * @stability S2
 */
export const agentDefinitions = pgTable('agent_definitions', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: text('tenant_id').notNull(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  version: text('version').notNull(),
  phase: text('phase').notNull(),
  modelPreference: text('model_preference').notNull(),
  fallbackModel: text('fallback_model'),
  allowedTools: jsonb('allowed_tools').$type<string[]>().notNull().default([]),
  maxRiskLevel: text('max_risk_level').notNull().default('R1'),
  promptTemplate: jsonb('prompt_template').notNull(),
  enabled: boolean('enabled').notNull().default(true),
  config: jsonb('config'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
