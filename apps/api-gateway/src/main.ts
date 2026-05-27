import type { ILLMProvider, LLMCallOptions, LLMMessage, LLMStreamChunk } from '@nexus/shared';
import { InMemoryPhaseBridge } from '@nexus/shared';
import { NexusLogger } from '@nexus/observability';
import { GatewayToolExecutor, ToolGatewayPipeline, registerPMTools } from '@nexus/tool-gateway';
import { createNexusApp } from './bootstrap.js';

class LocalPhaseOneProvider implements ILLMProvider {
  async *chat(messages: readonly LLMMessage[], _options: LLMCallOptions): AsyncGenerator<LLMStreamChunk> {
    const runState = this.detectState(messages);
    if (runState === 'needs_decompose') {
      yield* this.toolCall('tc-decompose', 'task.decompose', { requirement: this.userContent(messages), projectId: 'default' });
      return;
    }
    if (runState === 'needs_assign') {
      yield* this.toolCall('tc-assign', 'task.assign', { taskId: this.firstTaskId(messages), assignee: 'ai-agent' });
      return;
    }
    if (runState === 'needs_notify') {
      yield* this.toolCall('tc-notify', 'notification.send', { target: 'project-owner', message: '任务已完成拆解并分配给 ai-agent。' });
      return;
    }
    yield { type: 'text_delta', delta: 'Phase 1 PM MVP 已完成需求拆解、任务分配与通知。' };
    yield { type: 'done', usage: { input: 64, output: 32 } };
  }

  private detectState(messages: readonly LLMMessage[]): 'needs_decompose' | 'needs_assign' | 'needs_notify' | 'done' {
    const called = messages.flatMap((message) => message.toolCalls?.map((tool) => tool.name) ?? []);
    if (!called.includes('task.decompose')) return 'needs_decompose';
    if (!called.includes('task.assign')) return 'needs_assign';
    if (!called.includes('notification.send')) return 'needs_notify';
    return 'done';
  }

  private userContent(messages: readonly LLMMessage[]): string {
    return String(messages.find((message) => message.role === 'user')?.content ?? '项目管理需求');
  }

  private firstTaskId(messages: readonly LLMMessage[]): string {
    for (const message of messages) {
      if (message.role !== 'tool' || typeof message.content !== 'string') continue;
      try {
        const parsed = JSON.parse(message.content) as { tasks?: Array<{ id?: string }> };
        const taskId = parsed.tasks?.[0]?.id;
        if (taskId) return taskId;
      } catch {
        // Ignore non-JSON tool output.
      }
    }
    return 'unknown-task';
  }

  private async *toolCall(id: string, name: string, params: Record<string, unknown>): AsyncGenerator<LLMStreamChunk> {
    yield { type: 'tool_call_start', id, name };
    yield { type: 'tool_call_delta', id, argumentsDelta: JSON.stringify(params) };
    yield { type: 'tool_call_end', id };
    yield { type: 'done', usage: { input: 96, output: 24 } };
  }
}

const pipeline = new ToolGatewayPipeline();
const phaseBridge = new InMemoryPhaseBridge();
const logger = new NexusLogger();
pipeline.setAuditHandler((entry: { toolName: string; runId: string; success: boolean; durationMs: number }) => {
  logger.flow(
    { runId: entry.runId },
    'tool_gateway.audit',
    { toolName: entry.toolName, success: entry.success, durationMs: entry.durationMs },
  );
});
registerPMTools(pipeline, { tenantId: process.env['NEXUS_TENANT_ID'] ?? 'default', agentId: 'phase-intent', phaseBridge });

const app = createNexusApp({
  gatewayConfig: {
    port: Number(process.env['PORT'] ?? 3000),
    wsPort: Number(process.env['WS_PORT'] ?? process.env['PORT'] ?? 3000),
    corsOrigins: (process.env['CORS_ORIGINS'] ?? '*').split(','),
    hmacSecret: process.env['NEXUS_HMAC_SECRET'],
  },
  provider: new LocalPhaseOneProvider(),
  toolExecutor: new GatewayToolExecutor(pipeline, {
    tenantId: process.env['NEXUS_TENANT_ID'] ?? 'default',
    agentId: 'phase-intent',
    approvalPolicy: 'auto',
    maxRiskLevel: 'R2',
  }),
  defaultModel: process.env['NEXUS_MODEL'] ?? 'local-phase1-mvp',
  phaseBridge,
  logger,
});

process.once('SIGTERM', () => {
  void app.stop().finally(() => process.exit(0));
});
process.once('SIGINT', () => {
  void app.stop().finally(() => process.exit(0));
});

await app.start();
