import { boolean, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * 记忆系统的 PG 持久化层：
 * - evidence_entries: 跨 Compact 保留的证据（cross-run 复用）
 * - session_summaries: SessionShadow 的 PG 兜底（Redis 重启不丢）
 * - skills: SkillStore 的 PG 后端（多实例共享）
 * @stability S2
 */
export const evidenceEntries = pgTable('evidence_entries', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  runId: uuid('run_id').notNull(),
  sourceToolCall: text('source_tool_call').notNull(),
  messageIndex: integer('message_index').notNull(),
  type: text('type').notNull(),
  content: text('content').notNull(),
  turnCreated: integer('turn_created').notNull(),
  accessCount: integer('access_count').notNull().default(0),
  tokenCount: integer('token_count').notNull(),
  wasReferenced: boolean('was_referenced').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const sessionSummaries = pgTable('session_summaries', {
  runId: uuid('run_id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  version: integer('version').notNull().default(0),
  turnStart: integer('turn_start').notNull().default(0),
  turnEnd: integer('turn_end').notNull().default(0),
  progressSummary: text('progress_summary').notNull().default(''),
  confirmedDecisions: jsonb('confirmed_decisions').$type<string[]>().notNull().default([]),
  openQuestions: jsonb('open_questions').$type<string[]>().notNull().default([]),
  activeEvidenceIds: jsonb('active_evidence_ids').$type<string[]>().notNull().default([]),
  tokenCount: integer('token_count').notNull().default(0),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const skills = pgTable('skills', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  l0Summary: text('l0_summary').notNull(),
  tags: jsonb('tags').$type<string[]>().notNull().default([]),
  evidenceIds: jsonb('evidence_ids').$type<string[]>().notNull().default([]),
  dataClassification: text('data_classification').notNull().default('internal'),
  version: integer('version').notNull().default(1),
  status: text('status').notNull().default('draft'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
