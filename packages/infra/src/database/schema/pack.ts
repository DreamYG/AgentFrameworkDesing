import { jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * 已安装能力包记录（Pack 生命周期与 enable/disable 状态）。
 * @stability S2
 */
export const installedPacks = pgTable('installed_packs', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  name: text('name').notNull(),
  version: text('version').notNull(),
  status: text('status').notNull(),
  manifest: jsonb('manifest').notNull(),
  installedAt: timestamp('installed_at').notNull().defaultNow(),
  enabledAt: timestamp('enabled_at'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
