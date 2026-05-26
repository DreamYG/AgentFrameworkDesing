export type AuditEventType =
  | 'run.created'
  | 'run.status_changed'
  | 'tool.called'
  | 'tool.result'
  | 'approval.requested'
  | 'approval.decided'
  | 'budget.warning'
  | 'budget.exhausted'
  | 'error.occurred'
  | 'checkpoint.saved';

export interface AuditEntry {
  readonly id: string;
  readonly tenantId: string;
  readonly runId: string;
  readonly agentId: string;
  readonly eventType: AuditEventType;
  readonly timestamp: Date;
  readonly data: Readonly<Record<string, unknown>>;
  readonly userId?: string;
}

/**
 * Audit Engine — 结构化审计
 * 全量调用链路记录，覆盖每次工具调用和状态转移
 * @stability S2
 */
export class AuditEngine {
  private readonly entries: AuditEntry[] = [];
  private flushHandler?: (entries: readonly AuditEntry[]) => Promise<void>;

  onFlush(handler: (entries: readonly AuditEntry[]) => Promise<void>): void {
    this.flushHandler = handler;
  }

  record(params: Omit<AuditEntry, 'id' | 'timestamp'>): AuditEntry {
    const entry: AuditEntry = {
      ...params,
      id: crypto.randomUUID(),
      timestamp: new Date(),
    };
    this.entries.push(entry);
    return entry;
  }

  async flush(): Promise<number> {
    if (this.entries.length === 0) return 0;
    const batch = this.entries.splice(0);
    if (this.flushHandler) {
      await this.flushHandler(batch);
    }
    return batch.length;
  }

  getByRun(runId: string): readonly AuditEntry[] {
    return this.entries.filter((e) => e.runId === runId);
  }

  getByTenant(tenantId: string): readonly AuditEntry[] {
    return this.entries.filter((e) => e.tenantId === tenantId);
  }

  count(): number {
    return this.entries.length;
  }
}
