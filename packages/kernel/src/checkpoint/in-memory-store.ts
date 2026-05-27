import type { CheckpointSnapshot, ICheckpointStore } from './types.js';

/**
 * 开发与测试用 Checkpoint 存储。
 * @stability S1
 */
export class InMemoryCheckpointStore implements ICheckpointStore {
  private readonly snapshots = new Map<string, Array<{ id: string; snapshot: CheckpointSnapshot }>>();

  async save(snapshot: CheckpointSnapshot): Promise<string> {
    const entries = this.snapshots.get(snapshot.runId) ?? [];
    const id = `cp-${snapshot.runId}-${entries.length + 1}`;
    entries.push({ id, snapshot });
    this.snapshots.set(snapshot.runId, entries);
    return id;
  }

  async load(runId: string): Promise<CheckpointSnapshot | null> {
    return (this.snapshots.get(runId)?.[0]?.snapshot) ?? null;
  }

  async loadLatest(runId: string): Promise<CheckpointSnapshot | null> {
    const entries = this.snapshots.get(runId) ?? [];
    return entries.at(-1)?.snapshot ?? null;
  }

  list(runId: string): readonly CheckpointSnapshot[] {
    return (this.snapshots.get(runId) ?? []).map((entry) => entry.snapshot);
  }

  clear(runId?: string): void {
    if (runId) {
      this.snapshots.delete(runId);
      return;
    }
    this.snapshots.clear();
  }
}
