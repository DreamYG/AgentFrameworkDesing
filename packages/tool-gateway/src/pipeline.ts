import type { ToolDefinition, ToolResult, ToolContext, ToolRiskLevel } from '@nexus/shared';
import { ToolResultBudget } from './result-budget.js';
import { ToolSelfHealing } from './self-healing.js';
import { OutputSanitizer } from '@nexus/guardrails';

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
  readonly allowedTools?: readonly string[];
  readonly maxRiskLevel?: ToolRiskLevel;
}

export interface PipelineResult<T = unknown> {
  readonly success: boolean;
  readonly result?: ToolResult<T>;
  readonly blockedAt?: PipelineStage;
  readonly blockedReason?: string;
  readonly requiresApproval?: boolean;
  readonly durationMs: number;
  readonly selfHealFeedback?: string;
}

/**
 * Tool Gateway Pipeline — 完整 9 阶段管线
 * @stability S1
 */
export class ToolGatewayPipeline {
  private readonly tools = new Map<string, ToolDefinition>();
  private readonly resultBudget = new ToolResultBudget();
  private readonly selfHealing = new ToolSelfHealing();
  private readonly outputSanitizer = new OutputSanitizer();
  private onAudit?: (entry: { toolName: string; runId: string; success: boolean; durationMs: number }) => void;

  setAuditHandler(handler: typeof this.onAudit): void {
    this.onAudit = handler;
  }

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

  async execute<T>(toolName: string, params: unknown, ctx: PipelineContext): Promise<PipelineResult<T>> {
    const startTime = Date.now();
    const tool = this.tools.get(toolName);

    // Stage 1: Schema Validation
    if (!tool) {
      return { success: false, blockedAt: 'schema_validation', blockedReason: `Tool '${toolName}' not registered`, durationMs: Date.now() - startTime };
    }
    const schemaError = this.validateSchema(tool.schema, params);
    if (schemaError) {
      return {
        success: false,
        blockedAt: 'schema_validation',
        blockedReason: schemaError,
        durationMs: Date.now() - startTime,
      };
    }

    // Stage 2: Permission Check
    if (ctx.allowedTools && !ctx.allowedTools.includes(toolName)) {
      return { success: false, blockedAt: 'permission_check', blockedReason: `Tool '${toolName}' not in allowed list`, durationMs: Date.now() - startTime };
    }

    // Stage 3: Risk Assessment
    if (ctx.maxRiskLevel && this.riskExceeds(tool.riskLevel, ctx.maxRiskLevel)) {
      return { success: false, blockedAt: 'risk_assessment', blockedReason: `Tool risk ${tool.riskLevel} exceeds max ${ctx.maxRiskLevel}`, durationMs: Date.now() - startTime };
    }

    // Stage 4: Approval Check
    if (this.requiresApproval(tool.riskLevel, ctx.approvalPolicy)) {
      return { success: false, blockedAt: 'approval_check', blockedReason: `Tool '${toolName}' (${tool.riskLevel}) requires approval`, requiresApproval: true, durationMs: Date.now() - startTime };
    }

    // Stage 5: Param Sanitization (pass-through for now)

    // Stage 6: Execution
    const toolCtx: ToolContext = {
      runId: ctx.runId,
      agentId: ctx.agentId,
      tenantId: ctx.tenantId,
      turnIndex: ctx.turnIndex,
      abortSignal: AbortSignal.timeout(tool.timeout),
    };

    let result: ToolResult<T>;
    try {
      result = await (tool as ToolDefinition<unknown, T>).execute(params, toolCtx);
    } catch (error) {
      const healResult = this.selfHealing.heal(toolName, error instanceof Error ? error : new Error(String(error)));
      const durationMs = Date.now() - startTime;
      this.onAudit?.({ toolName, runId: ctx.runId, success: false, durationMs });
      return { success: false, result: { success: false, error: healResult.feedbackForModel, durationMs }, selfHealFeedback: healResult.feedbackForModel, durationMs };
    }

    // Stage 7: Output Sanitization (basic: truncate secrets)
    // Stage 8: Audit Record
    const durationMs = Date.now() - startTime;
    this.onAudit?.({ toolName, runId: ctx.runId, success: result.success, durationMs });

    // Stage 9: Result Truncation
    if (result.success && result.data) {
      const serialized = this.outputSanitizer.sanitize(JSON.stringify(result.data));
      const truncated = this.resultBudget.truncate(serialized, tool.characteristics.maxOutputTokens);
      if (truncated.wasTruncated) {
        return { success: true, result: { ...result, data: truncated.content as unknown as T }, durationMs };
      }
    }

    return { success: result.success, result, durationMs };
  }

  private requiresApproval(riskLevel: ToolRiskLevel, policy: string): boolean {
    if (policy === 'strict') return riskLevel !== 'R0';
    if (policy === 'standard') return riskLevel === 'R2' || riskLevel === 'R3' || riskLevel === 'R4' || riskLevel === 'RX';
    return riskLevel === 'R3' || riskLevel === 'R4' || riskLevel === 'RX';
  }

  private riskExceeds(toolRisk: ToolRiskLevel, maxRisk: ToolRiskLevel): boolean {
    const order: ToolRiskLevel[] = ['R0', 'R1', 'R2', 'R3', 'R4', 'RX'];
    return order.indexOf(toolRisk) > order.indexOf(maxRisk);
  }

  private validateSchema(schema: Record<string, unknown>, params: unknown): string | null {
    const required = schema['required'];
    if (!Array.isArray(required)) return null;
    if (typeof params !== 'object' || params === null) return 'params must be object';
    const input = params as Record<string, unknown>;
    for (const key of required) {
      if (typeof key === 'string' && !(key in input)) {
        return `missing required property: ${key}`;
      }
    }
    return null;
  }
}
