import { boolean, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * 外部连接器配置（MCP / REST / gRPC 端点）。
 * secretRef 引用密钥管理而非明文存储。
 * @stability S2
 */
export const connectors = pgTable('connectors', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  name: text('name').notNull(),
  platform: text('platform').notNull(),
  protocol: text('protocol').notNull(),
  endpoint: text('endpoint').notNull(),
  authMethod: text('auth_method').notNull(),
  secretRef: text('secret_ref'),
  capabilities: jsonb('capabilities').$type<string[]>().notNull().default([]),
  dataClassification: text('data_classification').notNull().default('internal'),
  enabled: boolean('enabled').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
