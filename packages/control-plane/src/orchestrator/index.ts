import type { AgentStreamEvent, IAgentRuntime, RuntimeInput } from '@nexus/shared';
import { RunManager } from '../run-manager/index.js';
import { ApprovalEngine } from '../approval-engine/index.js';
import { BudgetManager, type BudgetConfig } from '../budget-manager/index.js';
import { AuditEngine } from '../audit-engine/index.js';
import { PolicyEngine, type PolicyDecision } from '../policy-engine/index.js';

/**
 * Control Plane Orchestrator
 * 将 RunManager, Approval, Budget, Audit 与 Kernel 事件流联动
 * @stability S2
 */
export class ControlPlaneOrchestrator {
  readonly runManager = new RunManager();
  readonly approvalEngine = new ApprovalEngine();
  readonly auditEngine = new AuditEngine();
  readonly policyEngine = new PolicyEngine();
  private budgetManagers = new Map<string, BudgetManager>();
  private runtime: IAgentRuntime<RuntimeInput<string>> | null = null;
  private runtimeEventHandler?: (runId: string, event: AgentStreamEvent) => Promise<void>;

  constructor(private readonly defaultBudgetConfig: BudgetConfig = {
    tokenLimit: 100000,
    costLimitUsd: 1.0,
    timeLimitMs: 300000,
    stepLimit: 50,
  }) {
    this.approvalEngine.onApproval((req) => {
      this.safeTransition(req.runId, { type: 'approval_granted' });
      if (this.runtime) {
        void this.drainRuntimeResume(req.runId, { requestId: req.id });
      }
      this.auditEngine.record({
        tenantId: req.tenantId,
        runId: req.runId,
        agentId: '',
        eventType: 'approval.decided',
        data: { requestId: req.id, status: 'approved', decidedBy: req.decidedBy },
      });
    });

    this.approvalEngine.onDenial((req) => {
      this.safeTransition(req.runId, { type: 'approval_denied' });
      this.auditEngine.record({
        tenantId: req.tenantId,
        runId: req.runId,
        agentId: '',
        eventType: 'approval.decided',
        data: { requestId: req.id, status: 'denied', decidedBy: req.decidedBy },
      });
    });

    this.approvalEngine.onTimeout((req) => {
      this.safeTransition(req.runId, { type: 'approval_timeout' });
      this.auditEngine.record({
        tenantId: req.tenantId,
        runId: req.runId,
        agentId: '',
        eventType: 'approval.decided',
        data: { requestId: req.id, status: 'timeout' },
      });
    });
  }

  setRuntime(runtime: IAgentRuntime<RuntimeInput<string>>): void {
    this.runtime = runtime;
  }

  setRuntimeEventHandler(handler: (runId: string, event: AgentStreamEvent) => Promise<void>): void {
    this.runtimeEventHandler = handler;
  }

  /**
   * 创建并启动 AgentRun
   */
  createRun(params: { agentId: string; tenantId: string; userId: string; correlationId: string }) {
    const run = this.runManager.create(params);
    const budget = new BudgetManager(this.defaultBudgetConfig);
    this.budgetManagers.set(run.id, budget);

    this.auditEngine.record({
      tenantId: params.tenantId,
      runId: run.id,
      agentId: params.agentId,
      eventType: 'run.created',
      data: { userId: params.userId },
      userId: params.userId,
    });

    this.safeTransition(run.id, { type: 'dispatch' });
    this.auditEngine.record({
      tenantId: params.tenantId,
      runId: run.id,
      agentId: params.agentId,
      eventType: 'run.status_changed',
      data: { from: 'created', to: 'running' },
    });

    return run;
  }

  /**
   * 处理来自 QueryLoop 的流式事件 — 联动 Budget/Audit/Approval
   */
  processEvent(event: AgentStreamEvent, runId: string, tenantId: string, agentId: string): {
    shouldPause: boolean;
    pauseReason?: string;
    approvalRequestId?: string;
  } {
    const budget = this.budgetManagers.get(runId);

    switch (event.type) {
      case 'tool_use_result':
        budget?.recordStep();
        this.auditEngine.record({
          tenantId, runId, agentId,
          eventType: 'tool.called',
          data: { toolName: event.toolName, toolCallId: event.toolCallId, durationMs: event.durationMs, success: true },
        });
        break;

      case 'tool_use_error':
        this.auditEngine.record({
          tenantId, runId, agentId,
          eventType: 'tool.called',
          data: { toolName: event.toolName, toolCallId: event.toolCallId, success: false, error: event.error },
        });
        break;

      case 'approval_required': {
        this.safeTransition(runId, { type: 'require_approval', requestId: event.requestId });
        const req = this.approvalEngine.createRequest({
          runId, tenantId,
          toolName: event.toolName,
          toolParams: {},
          riskLevel: 'R2',
          reason: event.reason,
          approvers: ['admin'],
          timeoutMs: 600000,
        });
        this.auditEngine.record({
          tenantId, runId, agentId,
          eventType: 'approval.requested',
          data: { requestId: req.id, toolName: event.toolName },
        });
        return { shouldPause: true, pauseReason: 'approval_required', approvalRequestId: req.id };
      }

      case 'budget_warning':
        budget?.recordTokens(0, 0);
        this.auditEngine.record({
          tenantId, runId, agentId,
          eventType: 'budget.warning',
          data: { dimension: event.dimension, usage: event.usage, limit: event.limit },
        });
        if (budget?.isExhausted()) {
          this.safeTransition(runId, { type: 'budget_exhausted' });
          this.auditEngine.record({
            tenantId, runId, agentId,
            eventType: 'budget.exhausted',
            data: {},
          });
          return { shouldPause: true, pauseReason: 'budget_exhausted' };
        }
        break;

      case 'completed': {
        const transition: { type: 'complete' } | { type: 'run_failed'; reason?: string } =
          event.result.success
            ? { type: 'complete' }
            : { type: 'run_failed', reason: 'completed_without_success' };
        try {
          this.safeTransition(runId, transition);
        } catch {
          // already in terminal state
        }
        this.auditEngine.record({
          tenantId, runId, agentId,
          eventType: 'run.status_changed',
          data: { to: event.result.success ? 'succeeded' : 'failed', ...event.result },
        });
        this.budgetManagers.delete(runId);
        break;
      }

      case 'checkpoint':
        this.auditEngine.record({
          tenantId, runId, agentId,
          eventType: 'checkpoint.saved',
          data: { checkpointId: event.checkpointId, turnCount: event.turnCount },
        });
        break;

      default:
        break;
    }

    return { shouldPause: false };
  }

  /**
   * 记录 token 使用
   */
  recordTokenUsage(runId: string, input: number, output: number): void {
    const budget = this.budgetManagers.get(runId);
    budget?.recordTokens(input, output);
    if (budget?.isExhausted()) {
      const run = this.runManager.get(runId);
      if (run?.status === 'running') {
        this.safeTransition(runId, { type: 'budget_exhausted' });
        this.auditEngine.record({
          tenantId: run.tenantId,
          runId,
          agentId: run.agentId,
          eventType: 'budget.exhausted',
          data: { state: budget.getState() },
        });
      }
    }
  }

  getBudgetState(runId: string) {
    return this.budgetManagers.get(runId)?.getState();
  }

  refillBudget(runId: string, tokenAmount?: number): void {
    const run = this.runManager.get(runId);
    if (!run) throw new Error(`Run ${runId} not found`);
    const budget = this.budgetManagers.get(runId) ?? new BudgetManager(this.defaultBudgetConfig);
    this.budgetManagers.set(runId, budget);
    budget.refill({ tokenLimit: tokenAmount ?? this.defaultBudgetConfig.tokenLimit });
    if (run.status === 'waiting_budget') {
      this.safeTransition(runId, { type: 'budget_refilled' });
    }
    this.auditEngine.record({
      tenantId: run.tenantId,
      runId,
      agentId: run.agentId,
      eventType: 'budget.warning',
      data: { action: 'refilled', tokenAmount: tokenAmount ?? this.defaultBudgetConfig.tokenLimit },
    });
  }

  async cancelRun(runId: string, reason: string): Promise<void> {
    const run = this.runManager.get(runId);
    if (!run) throw new Error(`Run ${runId} not found`);
    await this.runtime?.cancel(runId, reason);
    this.safeTransition(runId, { type: 'user_cancel' });
    this.auditEngine.record({
      tenantId: run.tenantId,
      runId,
      agentId: run.agentId,
      eventType: 'run.status_changed',
      data: { to: 'cancelled', reason },
    });
    this.budgetManagers.delete(runId);
  }

  async *resumeRun(runId: string): AsyncGenerator<AgentStreamEvent> {
    const run = this.runManager.get(runId);
    if (!run || !this.runtime) return;
    if (run.status === 'resuming') {
      this.safeTransition(runId, { type: 'recovery_loaded' });
    }
    for await (const event of this.runtime.resume(runId, { type: 'event_received', data: { runId } })) {
      this.processEvent(event, runId, run.tenantId, run.agentId);
      await this.runtimeEventHandler?.(runId, event);
      yield event;
    }
  }

  evaluateToolPolicy(params: {
    userId: string;
    agentId: string;
    tenantId: string;
    toolName: string;
    toolRiskLevel: Parameters<PolicyEngine['evaluate']>[0]['toolRiskLevel'];
    dataScope?: string;
  }): PolicyDecision {
    return this.policyEngine.evaluate(params);
  }

  private async drainRuntimeResume(runId: string, data: Record<string, unknown>): Promise<void> {
    if (!this.runtime) return;
    for await (const event of this.runtime.resume(runId, { type: 'approval_granted', data })) {
      const run = this.runManager.get(runId);
      this.processEvent(event, runId, run?.tenantId ?? '', run?.agentId ?? '');
      await this.runtimeEventHandler?.(runId, event);
    }
  }

  private safeTransition(runId: string, event: Parameters<RunManager['transition']>[1]): void {
    try {
      this.runManager.transition(runId, event);
    } catch {
      // 状态可能已被取消或终结；审计仍保留触发事件。
    }
  }
}
