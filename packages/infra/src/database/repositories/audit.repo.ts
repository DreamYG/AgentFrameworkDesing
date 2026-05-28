import { desc, eq } from 'drizzle-orm';
import type { NexusDatabase } from '../client.js';
import { auditLogs } from '../schema/audit.js';

/**
 * 审计日志仓储：append-only 设计，查询按 runId 或 tenantId。
 * @stability S2
 */
export class AuditLogsRepository {
  constructor(private readonly db: NexusDatabase) {}

  async append(entry: {
    tenantId: string;
    runId?: string;
    agentId?: string;
    userId?: string;
    eventType: string;
    data: Record<string, unknown>;
  }): Promise<void> {
    await this.db.insert(auditLogs).values(entry);
  }

  async listByRun(runId: string) {
    return this.db.select().from(auditLogs).where(eq(auditLogs.runId, runId)).orderBy(desc(auditLogs.createdAt));
  }

  async listByTenant(tenantId: string) {
    return this.db.select().from(auditLogs).where(eq(auditLogs.tenantId, tenantId)).orderBy(desc(auditLogs.createdAt));
  }
}
