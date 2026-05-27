import { desc, eq } from 'drizzle-orm';
import type { NexusDatabase } from './client.js';
import { agentRuns, approvalRequests, auditLogs, checkpoints } from './schema.js';

export interface PersistedCheckpointSnapshot {
  readonly runId: string;
  readonly messages: readonly unknown[];
  readonly budget: unknown;
  readonly turnCount: number;
  readonly environmentState?: Record<string, unknown>;
  readonly evidenceRegistrySnapshot?: Record<string, unknown>;
  readonly sessionSummaryVersion?: number;
  readonly createdAt: Date;
  readonly reason: string;
}

export class AgentRunsRepository {
  constructor(private readonly db: NexusDatabase) {}

  async get(runId: string) {
    const rows = await this.db.select().from(agentRuns).where(eq(agentRuns.id, runId)).limit(1);
    return rows[0] ?? null;
  }

  async updateStatus(runId: string, status: string): Promise<void> {
    await this.db.update(agentRuns).set({ status, updatedAt: new Date() }).where(eq(agentRuns.id, runId));
  }
}

export class CheckpointsRepository {
  constructor(private readonly db: NexusDatabase) {}

  async save(snapshot: PersistedCheckpointSnapshot): Promise<string> {
    const [row] = await this.db
      .insert(checkpoints)
      .values({
        tenantId: 'default',
        runId: snapshot.runId,
        reason: snapshot.reason,
        turnCount: snapshot.turnCount,
        messages: snapshot.messages as unknown[],
        budget: snapshot.budget,
        environmentState: snapshot.environmentState,
        evidenceRegistry: snapshot.evidenceRegistrySnapshot,
        sessionSummaryVersion: snapshot.sessionSummaryVersion,
      })
      .returning({ id: checkpoints.id });

    if (!row) throw new Error('Failed to persist checkpoint');
    return row.id;
  }

  async loadLatest(runId: string): Promise<PersistedCheckpointSnapshot | null> {
    const rows = await this.db
      .select()
      .from(checkpoints)
      .where(eq(checkpoints.runId, runId))
      .orderBy(desc(checkpoints.createdAt))
      .limit(1);

    const row = rows[0];
    if (!row) return null;
    return {
      runId: row.runId,
      messages: row.messages as readonly unknown[],
      budget: row.budget,
      turnCount: row.turnCount,
      environmentState: row.environmentState as Record<string, unknown> | undefined,
      evidenceRegistrySnapshot: row.evidenceRegistry as Record<string, unknown> | undefined,
      sessionSummaryVersion: row.sessionSummaryVersion ?? undefined,
      createdAt: row.createdAt,
      reason: row.reason,
    };
  }
}

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
}

export class ApprovalRequestsRepository {
  constructor(private readonly db: NexusDatabase) {}

  async updateStatus(requestId: string, status: string, decidedBy?: string): Promise<void> {
    await this.db
      .update(approvalRequests)
      .set({ status, decidedBy, decidedAt: new Date() })
      .where(eq(approvalRequests.id, requestId));
  }
}
