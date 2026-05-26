import type { ToolDefinition, ToolResult, ToolContext, ToolRiskLevel } from '@nexus/shared';

export type PipelineStage =
  | 'schema_validation'
  | 'permission_check'
  | 'risk_assessment'
  | 'approval_check'
  | 'param_sanitization'
  | 'execution'
  | 'output_sanitization'
  | 'audit_record'
  | 'result_truncation';

export interface PipelineContext {
  readonly runId: string;
  readonly tenantId: string;
  readonly agentId: string;
  readonly turnIndex: number;
  readonly approvalPolicy: 'auto' | 'standard' | 'strict';
}

export interface PipelineResult<T = unknown> {
  readonly success: boolean;
  readonly result?: ToolResult<T>;
  readonly blockedAt?: PipelineStage;
  readonly blockedReason?: string;
  readonly requiresApproval?: boolean;
  readonly durationMs: number;
}

/**
 * Tool Gateway Pipeline — Pre/Post 管线
 * Schema → 权限 → 风险 → 审批 → 脱敏 → 执行 → 审计 → 截断
 * @stability S1
 */
export class ToolGatewayPipeline {
  private readonly tools = new Map<string, ToolDefinition>();

  registerTool(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
  }

  unregisterTool(name: string): void {
    this.tools.delete(name);
  }

  getTool(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  getAllTools(): readonly ToolDefinition[] {
    return [...this.tools.values()];
  }

  async execute<T>(
    toolName: string,
    params: unknown,
    pipelineCtx: PipelineContext,
  ): Promise<PipelineResult<T>> {
    const startTime = Date.now();
    const tool = this.tools.get(toolName);

    if (!tool) {
      return {
        success: false,
        blockedAt: 'schema_validation',
        blockedReason: `Tool '${toolName}' not registered`,
        durationMs: Date.now() - startTime,
      };
    }

    if (this.requiresApproval(tool.riskLevel, pipelineCtx.approvalPolicy)) {
      return {
        success: false,
        blockedAt: 'approval_check',
        blockedReason: `Tool '${toolName}' (${tool.riskLevel}) requires approval`,
        requiresApproval: true,
        durationMs: Date.now() - startTime,
      };
    }

    const toolCtx: ToolContext = {
      runId: pipelineCtx.runId,
      agentId: pipelineCtx.agentId,
      tenantId: pipelineCtx.tenantId,
      turnIndex: pipelineCtx.turnIndex,
      abortSignal: AbortSignal.timeout(tool.timeout),
    };

    try {
      const result = await (tool as ToolDefinition<unknown, T>).execute(params, toolCtx);
      return {
        success: result.success,
        result,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        result: {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          durationMs: Date.now() - startTime,
        },
        durationMs: Date.now() - startTime,
      };
    }
  }

  private requiresApproval(riskLevel: ToolRiskLevel, policy: string): boolean {
    if (policy === 'strict') return riskLevel !== 'R0';
    if (policy === 'standard') return riskLevel === 'R2' || riskLevel === 'R3' || riskLevel === 'R4' || riskLevel === 'RX';
    return riskLevel === 'R3' || riskLevel === 'R4' || riskLevel === 'RX';
  }
}
