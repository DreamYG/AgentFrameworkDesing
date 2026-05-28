import { desc, eq } from 'drizzle-orm';
import type { NexusDatabase } from '../client.js';
import { checkpoints } from '../schema/agent-run.js';

export interface PersistedCheckpointSnapshot {
  readonly tenantId: string;
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

/**
 * Checkpoint 仓储：异步 outbox 写入入口。
 * @stability S2
 */
export class CheckpointsRepository {
  constructor(private readonly db: NexusDatabase) {}

  async save(snapshot: PersistedCheckpointSnapshot): Promise<string> {
    const [row] = await this.db
      .insert(checkpoints)
      .values({
        tenantId: snapshot.tenantId,
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
      tenantId: row.tenantId,
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
