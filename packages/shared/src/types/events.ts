import type { PhaseId } from './phase.js';

/** @stability S0 */
export type PhaseBridgeEventType =
  | 'task.created'
  | 'task.updated'
  | 'task.assigned_to_ai'
  | 'task.completed'
  | 'task.failed'
  | 'task.acceptance_requested'
  | 'task.acceptance_result'
  | 'knowledge.synced'
  | 'knowledge.deprecated'
  | 'notification.requested'
  | 'approval.requested'
  | 'approval.decided'
  | 'risk.identified'
  | 'reminder.triggered';

export interface EventActor {
  readonly type: 'user' | 'agent' | 'system' | 'scheduler';
  readonly id: string;
  readonly name: string;
}

export type DataClassification = 'public' | 'internal' | 'confidential' | 'top_secret';

/**
 * Phase Bridge 事件信封
 * @stability S0
 */
export interface PhaseBridgeEvent<T = unknown> {
  readonly id: string;
  readonly schemaVersion: string;
  readonly source: PhaseId;
  readonly target?: PhaseId;
  readonly targets?: readonly PhaseId[];
  readonly type: PhaseBridgeEventType;
  readonly payload: T;
  readonly correlationId: string;
  readonly causationId: string;
  readonly idempotencyKey: string;
  readonly tenantId: string;
  readonly actor: EventActor;
  readonly dataClassification: DataClassification;
  readonly timestamp: Date;
  readonly ttl?: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
}
