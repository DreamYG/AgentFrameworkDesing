import type { PhaseId } from './phase.js';
import type { AgentStreamEvent } from './stream.js';
import type { ToolDefinition } from './tool.js';

/** Agent 运行上下文 */
export interface AgentContext {
  readonly runId: string;
  readonly tenantId: string;
  readonly userId: string;
  readonly correlationId: string;
  readonly abortSignal: AbortSignal;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** 权限上下文 */
export interface PermissionContext {
  readonly allowedTools: readonly string[];
  readonly maxRiskLevel: string;
  readonly budgetRemaining: number;
  readonly approvalPolicy: 'auto' | 'standard' | 'strict';
}

export interface HealthStatus {
  readonly healthy: boolean;
  readonly message?: string;
  readonly checkedAt: Date;
}

/**
 * Agent 运行时核心接口
 * @stability S1
 */
export interface IAgentRuntime<TInput = unknown, TOutput = unknown> {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly version: string;
  readonly phase: PhaseId;

  invoke(input: TInput, context: AgentContext): Promise<TOutput>;
  stream(input: TInput, context: AgentContext): AsyncGenerator<AgentStreamEvent>;
  getAvailableTools(permissions: PermissionContext): readonly ToolDefinition[];
  healthCheck(): Promise<HealthStatus>;
}
