import type { ToolResult } from '@nexus/shared';

/** 生命周期钩子阶段 */
export type HookPhase =
  | 'pre_plan'
  | 'post_plan'
  | 'pre_tool'
  | 'post_tool'
  | 'post_sampling'
  | 'pre_complete'
  | 'post_complete'
  | 'on_error'
  | 'on_compact'
  | 'on_checkpoint'
  | 'on_shutdown';

/** 钩子执行上下文 */
export interface HookContext {
  readonly runId: string;
  readonly tenantId: string;
  readonly agentId: string;
  readonly turnIndex: number;
  readonly phase: HookPhase;
  readonly data?: Readonly<Record<string, unknown>>;
}

/** 工具钩子上下文扩展 */
export interface ToolHookContext extends HookContext {
  readonly toolName: string;
  readonly toolCallId: string;
  readonly params?: unknown;
  readonly result?: ToolResult;
}

/** 生命周期钩子接口 */
export interface ILifecycleHook {
  readonly name: string;
  readonly phase: HookPhase;
  readonly priority?: number;
  execute(ctx: HookContext | ToolHookContext): Promise<void>;
}
