import type { AgentStreamEvent, PermissionContext } from '@nexus/shared';

/** 子 Agent 派生请求 */
export interface DelegateRequest<TInput = unknown> {
  readonly parentRunId: string;
  readonly childAgentId: string;
  readonly input: TInput;
  readonly permissions: PermissionContext;
  readonly budgetShare: number;
  readonly reason: string;
  /** 父 Run 当前的委托深度（默认 0） */
  readonly depth?: number;
  /** 父 Run 的租户 ID（可选，starter 也可从 parentRunId 反查） */
  readonly tenantId?: string;
  /** 父 Run 的用户 ID */
  readonly userId?: string;
}

/** 子 Agent 派生结果 */
export interface DelegateResult {
  readonly childRunId: string;
  readonly events: readonly AgentStreamEvent[];
  readonly success: boolean;
  readonly error?: string;
  readonly summary?: string;
  /** child run 最终的合并文本（最后一个 text_delta 序列） */
  readonly outputText?: string;
}

/** 子 Agent 启动端口：由 control-plane / bootstrap 实现并注入 */
export interface IChildRunStarter {
  start(params: ChildRunStartParams): Promise<ChildRunHandle>;
}

export interface ChildRunStartParams {
  readonly parentRunId: string;
  readonly childAgentId: string;
  readonly input: unknown;
  readonly permissions: PermissionContext;
  readonly depth: number;
  readonly reason: string;
  readonly tenantId?: string;
  readonly userId?: string;
}

export interface ChildRunHandle {
  readonly childRunId: string;
  readonly events: AsyncIterable<AgentStreamEvent>;
  cancel(reason: string): Promise<void>;
}

/** 子 Agent 委派端口 */
export interface IDelegateEngine {
  delegate<TInput>(request: DelegateRequest<TInput>): Promise<DelegateResult>;
  cancel(childRunId: string, reason: string): Promise<void>;
}

export interface DelegateEngineOptions {
  /** 子 Agent 启动器；不注入时退化为占位实现 */
  readonly starter?: IChildRunStarter;
  /** 最大委托递归深度，默认 3，超过即拒绝防止失控 */
  readonly maxDepth?: number;
}

const DEFAULT_MAX_DEPTH = 3;

/**
 * DelegateEngine — 子 Agent 委派执行
 * @stability S1
 */
export class DelegateEngine implements IDelegateEngine {
  private readonly activeChildren = new Map<string, { parentRunId: string; cancel: (reason: string) => Promise<void> }>();
  private readonly starter?: IChildRunStarter;
  private readonly maxDepth: number;

  constructor(options: DelegateEngineOptions = {}) {
    this.starter = options.starter;
    this.maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  }

  async delegate<TInput>(request: DelegateRequest<TInput>): Promise<DelegateResult> {
    const depth = request.depth ?? 0;
    if (depth >= this.maxDepth) {
      return {
        childRunId: '',
        events: [],
        success: false,
        error: `delegation_depth_exceeded:${depth}>=${this.maxDepth}`,
      };
    }

    if (!this.starter) {
      const childRunId = crypto.randomUUID();
      this.activeChildren.set(childRunId, { parentRunId: request.parentRunId, cancel: async () => undefined });
      return { childRunId, events: [], success: true };
    }

    const handle = await this.starter.start({
      parentRunId: request.parentRunId,
      childAgentId: request.childAgentId,
      input: request.input,
      permissions: request.permissions,
      depth: depth + 1,
      reason: request.reason,
      tenantId: request.tenantId,
      userId: request.userId,
    });
    this.activeChildren.set(handle.childRunId, { parentRunId: request.parentRunId, cancel: handle.cancel });

    const collected: AgentStreamEvent[] = [];
    let success = false;
    let error: string | undefined;
    let outputText = '';
    let summary: string | undefined;

    try {
      for await (const event of handle.events) {
        collected.push(event);
        if (event.type === 'text_delta') outputText += event.delta;
        if (event.type === 'completed') {
          success = event.result.success;
          if (!event.result.success) error = `child_run_failed`;
          summary = outputText || undefined;
          break;
        }
        if (event.type === 'error') {
          success = false;
          error = event.message ?? 'child_run_error';
          break;
        }
      }
    } catch (caught) {
      success = false;
      error = caught instanceof Error ? caught.message : String(caught);
    } finally {
      this.activeChildren.delete(handle.childRunId);
    }

    return {
      childRunId: handle.childRunId,
      events: collected,
      success,
      error,
      summary,
      outputText: outputText || undefined,
    };
  }

  async cancel(childRunId: string, reason: string): Promise<void> {
    const entry = this.activeChildren.get(childRunId);
    await entry?.cancel(reason);
    this.activeChildren.delete(childRunId);
  }

  getActiveChildren(parentRunId?: string): readonly string[] {
    const entries = [...this.activeChildren.entries()];
    return entries
      .filter(([, value]) => !parentRunId || value.parentRunId === parentRunId)
      .map(([childRunId]) => childRunId);
  }
}
