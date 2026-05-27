import type { LLMToolDef, ToolResult, ToolRiskLevel } from '@nexus/shared';
import { ToolGatewayPipeline, type PipelineContext } from './pipeline.js';

export interface GatewayToolExecutorOptions {
  readonly tenantId?: string;
  readonly agentId?: string;
  readonly allowedTools?: readonly string[];
  readonly approvalPolicy?: 'auto' | 'standard' | 'strict';
  readonly maxRiskLevel?: ToolRiskLevel;
}

/**
 * 将 ToolGatewayPipeline 暴露为 Kernel QueryLoop 可使用的工具执行器。
 * @stability S1
 */
export class GatewayToolExecutor {
  constructor(
    private readonly pipeline: ToolGatewayPipeline,
    private readonly options: GatewayToolExecutorOptions = {},
  ) {}

  async execute(toolName: string, args: string, runId: string): Promise<ToolResult> {
    const params = this.parseArgs(args);
    const ctx: PipelineContext = {
      runId,
      tenantId: this.options.tenantId ?? 'default',
      agentId: this.options.agentId ?? 'runtime',
      turnIndex: 0,
      approvalPolicy: this.options.approvalPolicy ?? 'auto',
      allowedTools: this.options.allowedTools,
      maxRiskLevel: this.options.maxRiskLevel,
    };

    const result = await this.pipeline.execute(toolName, params, ctx);
    if (result.requiresApproval) {
      return {
        success: false,
        error: result.blockedReason,
        durationMs: result.durationMs,
        metadata: { requiresApproval: true, toolName, reason: result.blockedReason },
      };
    }

    return result.result ?? {
      success: false,
      error: result.blockedReason ?? 'Tool pipeline blocked execution',
      durationMs: result.durationMs,
    };
  }

  getToolDefs(): readonly LLMToolDef[] {
    return this.pipeline.getAllTools().map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.schema,
    }));
  }

  private parseArgs(args: string): unknown {
    if (!args.trim()) return {};
    try {
      return JSON.parse(args);
    } catch {
      return { value: args };
    }
  }
}
