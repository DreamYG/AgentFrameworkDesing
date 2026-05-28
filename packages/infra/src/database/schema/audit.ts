import { jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * 审计日志。每次工具调用、决策、审批均落库。
 * @stability S2
 */
export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: text('tenant_id').notNull(),
  runId: uuid('run_id'),
  agentId: text('agent_id'),
  userId: text('user_id'),
  eventType: text('event_type').notNull(),
  data: jsonb('data').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
