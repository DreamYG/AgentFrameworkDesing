import type { AgentStreamEvent, PermissionContext } from '@nexus/shared';

/** 子 Agent 派生请求 */
export interface DelegateRequest<TInput = unknown> {
  readonly parentRunId: string;
  readonly childAgentId: string;
  readonly input: TInput;
  readonly permissions: PermissionContext;
  readonly budgetShare: number;
  readonly reason: string;
}

/** 子 Agent 派生结果 */
export interface DelegateResult {
  readonly childRunId: string;
  readonly events: readonly AgentStreamEvent[];
  readonly success: boolean;
}

/** 子 Agent 委派端口 */
export interface IDelegateEngine {
  delegate<TInput>(request: DelegateRequest<TInput>): Promise<DelegateResult>;
  cancel(childRunId: string, reason: string): Promise<void>;
}

/** 最小委派引擎：锁定权限与预算后返回子 Run 占位 */
export class DelegateEngine implements IDelegateEngine {
  private readonly activeChildren = new Map<string, DelegateRequest>();

  async delegate<TInput>(request: DelegateRequest<TInput>): Promise<DelegateResult> {
    const childRunId = crypto.randomUUID();
    this.activeChildren.set(childRunId, request as DelegateRequest);
    return {
      childRunId,
      events: [],
      success: true,
    };
  }

  async cancel(childRunId: string, _reason: string): Promise<void> {
    this.activeChildren.delete(childRunId);
  }

  getActiveChildren(parentRunId?: string): readonly string[] {
    const entries = [...this.activeChildren.entries()];
    return entries
      .filter(([, request]) => !parentRunId || request.parentRunId === parentRunId)
      .map(([childRunId]) => childRunId);
  }
}
