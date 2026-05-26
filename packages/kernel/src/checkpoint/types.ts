import type { BudgetSnapshot } from '@nexus/shared';

/** Checkpoint 触发原因 */
export type CheckpointReason =
  | 'post_model_output'
  | 'post_tool_execution'
  | 'post_compact'
  | 'pre_approval_wait'
  | 'high_risk_decision'
  | 'periodic_interval'
  | 'graceful_shutdown'
  | 'force_shutdown';

/** Checkpoint 快照 */
export interface CheckpointSnapshot {
  readonly runId: string;
  readonly messages: readonly unknown[];
  readonly budget: BudgetSnapshot;
  readonly turnCount: number;
  readonly environmentState?: Record<string, unknown>;
  readonly pendingApproval?: string;
  readonly partialContent?: string;
  readonly evidenceRegistrySnapshot?: Record<string, unknown>;
  readonly sessionSummaryVersion?: number;
  readonly createdAt: Date;
  readonly reason: CheckpointReason;
}

/** Checkpoint 持久化端口（W5-W6 实装） */
export interface ICheckpointStore {
  save(snapshot: CheckpointSnapshot): Promise<string>;
  load(runId: string): Promise<CheckpointSnapshot | null>;
  loadLatest(runId: string): Promise<CheckpointSnapshot | null>;
}
