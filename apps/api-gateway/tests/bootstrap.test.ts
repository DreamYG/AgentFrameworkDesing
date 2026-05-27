import { describe, it, expect } from 'vitest';
import type {
  AgentStreamEvent,
  ILLMProvider,
  LLMCallOptions,
  LLMMessage,
  LLMStreamChunk,
  ToolResult,
} from '@nexus/shared';
import type { LLMToolDef, ToolExecutor } from '@nexus/kernel';
import { createNexusApp } from '../src/bootstrap.js';

class MockProvider implements ILLMProvider {
  private callCount = 0;
  async *chat(
    _messages: readonly LLMMessage[],
    _options: LLMCallOptions,
  ): AsyncGenerator<LLMStreamChunk> {
    this.callCount++;
    if (this.callCount === 1) {
      yield { type: 'text_delta', delta: 'Analyzing requirement.' };
      yield { type: 'tool_call_start', id: 'tc1', name: 'project.query' };
      yield { type: 'tool_call_delta', id: 'tc1', argumentsDelta: '{}' };
      yield { type: 'tool_call_end', id: 'tc1' };
      yield { type: 'done', usage: { input: 50, output: 30 } };
      return;
    }
    yield { type: 'text_delta', delta: 'Requirement analysis complete.' };
    yield { type: 'done', usage: { input: 100, output: 40 } };
  }
}

class MockToolExecutor implements ToolExecutor {
  async execute(toolName: string, _args: string, _runId: string): Promise<ToolResult> {
    if (toolName === 'project.query') {
      return { success: true, data: { projects: [] }, durationMs: 5 };
    }
    return { success: false, error: `Unknown tool: ${toolName}`, durationMs: 0 };
  }

  getToolDefs(): readonly LLMToolDef[] {
    return [
      {
        name: 'project.query',
        description: 'Query project info',
        inputSchema: { type: 'object', properties: {} },
      },
    ];
  }
}

describe('Bootstrap integration', () => {
  it('wires gateway → orchestrator → runtime → query loop → audit', async () => {
    const app = createNexusApp({
      gatewayConfig: { port: 0, wsPort: 0, corsOrigins: [] },
      provider: new MockProvider(),
      toolExecutor: new MockToolExecutor(),
      defaultModel: 'mock-model',
    });

    expect(app.registry.getEnabled().length).toBeGreaterThanOrEqual(6);
    // setRuntime 已在 bootstrap 中调用：runtime 字段不再为 null
    expect(app.runtime).toBeDefined();

    // 触发完整链路：gateway.handleMessage → orchestrator.createRun → runtime.start → query loop
    const response = await app.gateway.handleMessage({
      body: {
        content: 'Help me analyze project status',
        tenantId: 'tenant-1',
        userId: 'user-1',
      },
    });

    expect(response.status).toBe('accepted');
    expect(response.runId).toBeDefined();

    // 等待异步 run 完成
    await new Promise((resolve) => setTimeout(resolve, 100));

    const auditEntries = app.orchestrator.auditEngine.getByRun(response.runId!);
    const eventTypes = auditEntries.map((e) => e.eventType);
    expect(eventTypes).toContain('run.created');
    expect(eventTypes).toContain('tool.called');

    const runStatus = app.orchestrator.runManager.get(response.runId!)?.status;
    expect(['succeeded', 'failed', 'running']).toContain(runStatus);
  });

  it('publishes stream events through broker for ws subscribers', async () => {
    const app = createNexusApp({
      gatewayConfig: { port: 0, wsPort: 0, corsOrigins: [] },
      provider: new MockProvider(),
      toolExecutor: new MockToolExecutor(),
      defaultModel: 'mock-model',
    });

    const response = await app.gateway.handleMessage({
      body: { content: 'test stream', tenantId: 't', userId: 'u' },
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    const collected: AgentStreamEvent[] = [];
    for await (const event of app.gateway.streamEvents(response.runId!)) {
      collected.push(event);
      if (collected.length >= 3) break;
    }
    expect(collected.length).toBeGreaterThan(0);
    expect(collected.some((e) => e.type === 'text_delta')).toBe(true);
  });
});
