import type { IPhaseBridge, PhaseBridgeEvent, ToolDefinition, ToolRiskLevel } from '@nexus/shared';
import { PM_TOOL_HANDLERS, PM_TOOLS } from '@nexus/mcp-pm-tools';
import { buildTool } from './build-tool.js';
import { ToolGatewayPipeline } from './pipeline.js';

export interface PMToolsBridgeOptions {
  readonly tenantId?: string;
  readonly agentId?: string;
  readonly phaseBridge?: IPhaseBridge;
}

/**
 * 将 PM MCP 工具的本地 handler 注册进 Tool Gateway。
 * @stability S3
 */
export function createPMTools(options: PMToolsBridgeOptions = {}): readonly ToolDefinition[] {
  return PM_TOOLS.map((tool) => buildTool<Record<string, unknown>, unknown>({
    name: tool.name,
    description: tool.description,
    schema: tool.inputSchema,
    riskLevel: tool.riskLevel as ToolRiskLevel,
    characteristics: {
      isReadOnly: tool.riskLevel === 'R0',
      isDestructive: false,
      isConcurrencySafe: tool.riskLevel === 'R0',
      isIdempotent: tool.riskLevel === 'R0',
      reversibility: 'reversible',
      environmentSideEffects: tool.riskLevel === 'R0' ? ['none'] : ['external_system_state'],
      maxOutputTokens: 4096,
    },
    execute: async (params, ctx) => {
      const started = Date.now();
      const handler = PM_TOOL_HANDLERS[tool.name];
      if (!handler) {
        return { success: false, error: `PM tool not found: ${tool.name}`, durationMs: Date.now() - started };
      }

      const data = handler(params);
      if (isToolError(data)) {
        return { success: false, error: String(data.error), durationMs: Date.now() - started };
      }

      await publishBusinessEvent(tool.name, data, {
        tenantId: options.tenantId ?? ctx.tenantId,
        agentId: options.agentId ?? ctx.agentId,
        runId: ctx.runId,
        phaseBridge: options.phaseBridge,
      });

      return { success: true, data, durationMs: Date.now() - started };
    },
  }));
}

export function registerPMTools(pipeline: ToolGatewayPipeline, options: PMToolsBridgeOptions = {}): readonly ToolDefinition[] {
  const tools = createPMTools(options);
  for (const tool of tools) {
    pipeline.registerTool(tool);
  }
  return tools;
}

function isToolError(value: unknown): value is { error: unknown } {
  return typeof value === 'object' && value !== null && 'error' in value;
}

async function publishBusinessEvent(
  toolName: string,
  payload: unknown,
  ctx: { tenantId: string; agentId: string; runId: string; phaseBridge?: IPhaseBridge },
): Promise<void> {
  if (!ctx.phaseBridge) return;
  const type = toolName === 'task.decompose'
    ? 'task.created'
    : toolName === 'task.assign'
      ? 'task.assigned_to_ai'
      : toolName === 'notification.send'
        ? 'notification.requested'
        : null;
  if (!type) return;

  const event: PhaseBridgeEvent = {
    id: crypto.randomUUID(),
    schemaVersion: '1.0',
    source: 'intent',
    type,
    payload,
    correlationId: ctx.runId,
    causationId: ctx.runId,
    idempotencyKey: `${ctx.runId}:${toolName}:${JSON.stringify(payload).slice(0, 128)}`,
    tenantId: ctx.tenantId,
    actor: { type: 'agent', id: ctx.agentId, name: ctx.agentId },
    dataClassification: 'internal',
    timestamp: new Date(),
  };
  await ctx.phaseBridge.publish(event);
}
