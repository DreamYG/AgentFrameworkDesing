import { buildTool } from './build-tool.js';
import type { ToolGatewayPipeline } from './pipeline.js';

export interface AgentInvocationResult {
  readonly childRunId: string;
  readonly success: boolean;
  readonly outputText?: string;
  readonly error?: string;
  readonly events: number;
}

export interface DelegateToolOptions {
  /**
   * 子 Agent 委派回调（DelegateEngine 注入）。
   */
  readonly invokeAgent: (params: {
    agentId: string;
    input: string;
    reason: string;
    runId: string;
    tenantId: string;
  }) => Promise<AgentInvocationResult>;
  /**
   * 可调用的子 Agent 白名单；未提供时不限制（但仍受 PolicyEngine 双层约束）。
   */
  readonly invokableAgents?: readonly string[];
}

/**
 * 注册 ai.agent.invoke 子 Agent 委派工具。
 * 由 bootstrap 在 DelegateEngine 装配完成后调用。
 * @stability S3
 */
export function registerDelegateTool(pipeline: ToolGatewayPipeline, options: DelegateToolOptions): void {
  pipeline.registerTool(buildTool<{ agentId: string; input: string; reason?: string }, AgentInvocationResult>({
    name: 'ai.agent.invoke',
    description: '把一个子任务委派给另一个 Agent 处理，等待其完成并返回汇总结果。仅在确认对方 Agent 更合适时使用；不要把整个原任务原样转发。',
    schema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: '目标子 Agent 的 ID' },
        input: { type: 'string', description: '传给子 Agent 的明确子任务（自然语言）' },
        reason: { type: 'string', description: '说明委派的理由，便于审计' },
      },
      required: ['agentId', 'input'],
    },
    riskLevel: 'R1',
    characteristics: {
      isReadOnly: false,
      isDestructive: false,
      isConcurrencySafe: false,
      isIdempotent: false,
      reversibility: 'reversible',
      environmentSideEffects: ['external_system_state'],
      maxOutputTokens: 8192,
    },
    timeout: 180_000,
    execute: async (params, ctx) => {
      const started = Date.now();
      if (options.invokableAgents && !options.invokableAgents.includes(params.agentId)) {
        return {
          success: false,
          error: `Agent "${params.agentId}" is not in the invokable allowlist.`,
          durationMs: Date.now() - started,
        };
      }
      try {
        const result = await options.invokeAgent({
          agentId: params.agentId,
          input: params.input,
          reason: params.reason ?? 'parent delegated subtask',
          runId: ctx.runId,
          tenantId: ctx.tenantId,
        });
        return {
          success: result.success,
          data: result,
          error: result.success ? undefined : result.error,
          durationMs: Date.now() - started,
        };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error), durationMs: Date.now() - started };
      }
    },
  }));
}
