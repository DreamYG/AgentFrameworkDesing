import { integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * R2+ 工具调用的审批请求。
 * @stability S2
 */
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
