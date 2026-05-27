import type { PersistedCheckpointSnapshot, CheckpointsRepository } from './database/repositories.js';
import type { QueueManager } from './queue/index.js';

/** Durable Checkpoint Outbox */
export class CheckpointOutbox {
  constructor(
    private readonly queue: QueueManager,
    private readonly repository: CheckpointsRepository,
  ) {}

  async enqueue(snapshot: PersistedCheckpointSnapshot): Promise<string> {
    return this.queue.addJob('checkpoint-outbox', {
      tenantId: 'default',
      type: 'checkpoint.save',
      data: { snapshot: snapshot as unknown as Record<string, unknown> },
    });
  }

  async forceFlush(snapshot: PersistedCheckpointSnapshot): Promise<string> {
    return this.repository.save(snapshot);
  }

  registerWorker(): void {
    this.queue.registerHandler('checkpoint-outbox', async (payload) => {
      const snapshot = payload.data['snapshot'] as unknown as PersistedCheckpointSnapshot;
      await this.repository.save(snapshot);
    });
  }
}
