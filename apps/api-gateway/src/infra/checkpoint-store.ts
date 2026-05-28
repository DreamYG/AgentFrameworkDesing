import type { CheckpointSnapshot, ICheckpointStore } from '@nexus/kernel';
import type { CheckpointOutbox, CheckpointsRepository, PersistedCheckpointSnapshot } from '@nexus/infra';

/** PostgreSQL Checkpoint 仓储适配器。 */
export class RepositoryCheckpointStore implements ICheckpointStore {
  constructor(
    private readonly repository: CheckpointsRepository,
    private readonly tenantId: string,
    private readonly outbox?: CheckpointOutbox,
  ) {}

  save(snapshot: CheckpointSnapshot): Promise<string> {
    const persisted = this.toPersisted(snapshot);
    return this.outbox ? this.outbox.enqueue(persisted) : this.repository.save(persisted);
  }

  load(runId: string): Promise<CheckpointSnapshot | null> {
    return this.loadLatest(runId);
  }

  async loadLatest(runId: string): Promise<CheckpointSnapshot | null> {
    const snapshot = await this.repository.loadLatest(runId);
    return snapshot ? this.fromPersisted(snapshot) : null;
  }

  private toPersisted(snapshot: CheckpointSnapshot): PersistedCheckpointSnapshot {
    return {
      tenantId: this.tenantId,
      runId: snapshot.runId,
      messages: snapshot.messages,
      budget: snapshot.budget,
      turnCount: snapshot.turnCount,
      environmentState: snapshot.environmentState,
      evidenceRegistrySnapshot: snapshot.evidenceRegistrySnapshot,
      sessionSummaryVersion: snapshot.sessionSummaryVersion,
      createdAt: snapshot.createdAt,
      reason: snapshot.reason,
    };
  }

  private fromPersisted(snapshot: PersistedCheckpointSnapshot): CheckpointSnapshot {
    return {
      runId: snapshot.runId,
      messages: snapshot.messages,
      budget: snapshot.budget as CheckpointSnapshot['budget'],
      turnCount: snapshot.turnCount,
      environmentState: snapshot.environmentState,
      evidenceRegistrySnapshot: snapshot.evidenceRegistrySnapshot,
      sessionSummaryVersion: snapshot.sessionSummaryVersion,
      createdAt: snapshot.createdAt,
      reason: snapshot.reason as CheckpointSnapshot['reason'],
    };
  }
}
