/** AgentRun 状态 */
export type AgentRunStatus =
  | 'created'
  | 'running'
  | 'waiting_approval'
  | 'waiting_external'
  | 'waiting_budget'
  | 'resuming'
  | 'draining'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'handed_over';

/** 状态转移事件 */
export type RunEvent =
  | { type: 'dispatch' }
  | { type: 'require_approval'; requestId: string }
  | { type: 'approval_granted' }
  | { type: 'approval_denied' }
  | { type: 'approval_timeout' }
  | { type: 'event_needed' }
  | { type: 'event_received' }
  | { type: 'budget_exhausted' }
  | { type: 'budget_refilled' }
  | { type: 'budget_denied' }
  | { type: 'recovery_loaded' }
  | { type: 'complete' }
  | { type: 'timeout' }
  | { type: 'run_failed'; reason?: string }
  | { type: 'recovery_attempt' }
  | { type: 'escalate_human' }
  | { type: 'shutdown_received' }
  | { type: 'drain_completed' }
  | { type: 'drain_completed_all' }
  | { type: 'user_cancel' };

export interface AgentRun {
  readonly id: string;
  readonly agentId: string;
  readonly tenantId: string;
  readonly userId: string;
  status: AgentRunStatus;
  readonly createdAt: Date;
  updatedAt: Date;
  readonly correlationId: string;
  metadata?: Record<string, unknown>;
}

/**
 * Run Manager — AgentRun 状态机管理
 * 职责：CRUD + 状态转移 + 调度 + 并发控制
 * 不做：单 Run 内 while 循环（那是 QueryLoop 的事）
 * @stability S1
 */
export class RunManager {
  private readonly runs = new Map<string, AgentRun>();

  create(params: {
    agentId: string;
    tenantId: string;
    userId: string;
    correlationId: string;
  }): AgentRun {
    const run: AgentRun = {
      id: crypto.randomUUID(),
      agentId: params.agentId,
      tenantId: params.tenantId,
      userId: params.userId,
      status: 'created',
      createdAt: new Date(),
      updatedAt: new Date(),
      correlationId: params.correlationId,
    };
    this.runs.set(run.id, run);
    return run;
  }

  transition(runId: string, event: RunEvent): AgentRunStatus {
    const run = this.runs.get(runId);
    if (!run) throw new Error(`Run ${runId} not found`);

    const newStatus = this.computeNextStatus(run.status, event);
    if (!newStatus) {
      throw new Error(`Invalid transition: ${run.status} + ${event.type}`);
    }

    run.status = newStatus;
    run.updatedAt = new Date();
    return newStatus;
  }

  get(runId: string): AgentRun | undefined {
    return this.runs.get(runId);
  }

  getByTenant(tenantId: string): readonly AgentRun[] {
    return [...this.runs.values()].filter((r) => r.tenantId === tenantId);
  }

  getAll(): readonly AgentRun[] {
    return [...this.runs.values()];
  }

  getActive(): readonly AgentRun[] {
    return [...this.runs.values()].filter(
      (r) => r.status === 'running' || r.status === 'resuming',
    );
  }

  private computeNextStatus(current: AgentRunStatus, event: RunEvent): AgentRunStatus | null {
    const terminal: readonly AgentRunStatus[] = ['succeeded', 'failed', 'cancelled', 'handed_over'];
    if (!terminal.includes(current)) {
      if (event.type === 'shutdown_received') return 'draining';
      if (event.type === 'user_cancel') return 'cancelled';
    }

    const transitions: Record<string, Partial<Record<string, AgentRunStatus>>> = {
      created: { dispatch: 'running' },
      running: {
        require_approval: 'waiting_approval',
        event_needed: 'waiting_external',
        budget_exhausted: 'waiting_budget',
        complete: 'succeeded',
        timeout: 'failed',
        run_failed: 'failed',
        shutdown_received: 'draining',
        user_cancel: 'cancelled',
      },
      waiting_approval: {
        approval_granted: 'running',
        approval_denied: 'failed',
        approval_timeout: 'handed_over',
        user_cancel: 'cancelled',
      },
      waiting_external: {
        event_received: 'running',
        user_cancel: 'cancelled',
      },
      waiting_budget: {
        budget_refilled: 'resuming',
        budget_denied: 'handed_over',
        user_cancel: 'cancelled',
      },
      resuming: {
        recovery_loaded: 'running',
      },
      failed: {
        recovery_attempt: 'resuming',
        escalate_human: 'handed_over',
      },
      draining: {
        drain_completed: 'waiting_external',
        drain_completed_all: 'succeeded',
      },
    };

    const allowed = transitions[current];
    if (!allowed) return null;
    return (allowed[event.type] as AgentRunStatus) ?? null;
  }
}
