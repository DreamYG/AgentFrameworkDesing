import { pgTable, text, timestamp, jsonb, integer, boolean, uuid } from 'drizzle-orm/pg-core';

/**
 * PostgreSQL Schema — Nexus 核心表
 * 所有表包含 tenantId 预埋多租户
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

export const agentRuns = pgTable('agent_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: text('tenant_id').notNull(),
  agentId: uuid('agent_id').notNull(),
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

export const approvalRequests = pgTable('approval_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: text('tenant_id').notNull(),
  runId: uuid('run_id').notNull(),
  toolName: text('tool_name').notNull(),
  toolParams: jsonb('tool_params').notNull(),
  riskLevel: text('risk_level').notNull(),
  reason: text('reason').notNull(),
  approvers: jsonb('approvers').$type<string[]>().notNull(),
  requiredApprovals: integer('required_approvals').notNull().default(1),
  status: text('status').notNull().default('pending'),
  decidedBy: text('decided_by'),
  deadline: timestamp('deadline').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  decidedAt: timestamp('decided_at'),
});

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
