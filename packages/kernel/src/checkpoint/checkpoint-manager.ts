import type { CheckpointReason, CheckpointSnapshot, ICheckpointStore } from './types.js';

export interface CheckpointConfig {
  readonly periodicInterval: number;
  readonly enablePostModelOutput: boolean;
  readonly enablePostToolExecution: boolean;
}

const DEFAULT_CONFIG: CheckpointConfig = {
  periodicInterval: 5,
  enablePostModelOutput: false,
  enablePostToolExecution: true,
};

/**
 * Checkpoint 管理器骨架
 * W1-W2：仅实现触发判定逻辑，持久化在 W5-W6 通过 ICheckpointStore 实装
 */
export class CheckpointManager {
  private toolCallsSinceLastCheckpoint = 0;
  private store: ICheckpointStore | null = null;
  private readonly config: CheckpointConfig;

  constructor(config?: Partial<CheckpointConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  setStore(store: ICheckpointStore): void {
    this.store = store;
  }

  shouldCheckpoint(reason: CheckpointReason): boolean {
    switch (reason) {
      case 'post_tool_execution':
        this.toolCallsSinceLastCheckpoint++;
        return (
          this.config.enablePostToolExecution &&
          this.toolCallsSinceLastCheckpoint >= this.config.periodicInterval
        );
      case 'post_model_output':
        return this.config.enablePostModelOutput;
      case 'periodic_interval':
        return this.toolCallsSinceLastCheckpoint >= this.config.periodicInterval;
      case 'pre_approval_wait':
      case 'high_risk_decision':
      case 'graceful_shutdown':
      case 'force_shutdown':
      case 'post_compact':
        return true;
      default:
        return false;
    }
  }

  async save(snapshot: CheckpointSnapshot): Promise<string | null> {
    if (!this.store) {
      return null;
    }
    this.toolCallsSinceLastCheckpoint = 0;
    return this.store.save(snapshot);
  }

  async loadLatest(runId: string): Promise<CheckpointSnapshot | null> {
    if (!this.store) return null;
    return this.store.loadLatest(runId);
  }
}
