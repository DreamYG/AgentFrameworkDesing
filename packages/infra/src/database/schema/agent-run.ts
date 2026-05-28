import { integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * AgentRun 实体。一次会话/任务的完整运行记录。
 * @stability S2
 */
export const agentRuns = pgTable('agent_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: text('tenant_id').notNull(),
  agentId: text('agent_id').notNull(),
  userId: text('user_id').notNull(),
  status: text('status').notNull().default('created'),
  correlationId: text('correlation_id').notNull(),
  input: jsonb('input'),
  output: jsonb('output'),
  metadata: jsonb('metadata'),
  tokensUsed: integer('tokens_used').default(0),
  costUsd: text('cost_usd').default('0'),
  turnsExecuted: integer('turns_executed').default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  completedAt: timestamp('completed_at'),
});

/** Run 检查点（多卡点 + 异步 outbox 写入） */
export const checkpoints = pgTable('checkpoints', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: text('tenant_id').notNull(),
  runId: uuid('run_id').notNull(),
  reason: text('reason').notNull(),
  turnCount: integer('turn_count').notNull(),
  messages: jsonb('messages').notNull(),
  budget: jsonb('budget').notNull(),
  environmentState: jsonb('environment_state'),
  evidenceRegistry: jsonb('evidence_registry'),
  sessionSummaryVersion: integer('session_summary_version'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
