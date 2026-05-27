import { describe, expect, it } from 'vitest';
import type { ILLMProvider, LLMCallOptions, LLMMessage, LLMStreamChunk } from '@nexus/shared';
import { QueryLoop } from '@nexus/kernel';
import { GatewayToolExecutor, ToolGatewayPipeline, registerPMTools } from '@nexus/tool-gateway';

class PMMockProvider implements ILLMProvider {
  async *chat(messages: readonly LLMMessage[], _options: LLMCallOptions): AsyncGenerator<LLMStreamChunk> {
    const called = messages.flatMap((message) => message.toolCalls?.map((tool) => tool.name) ?? []);
    if (!called.includes('task.decompose')) {
      yield* this.callTool('tc-decompose', 'task.decompose', { requirement: '登录,权限', projectId: 'p1' });
      return;
    }
    if (!called.includes('task.assign')) {
      const taskId = this.firstTaskId(messages);
      yield* this.callTool('tc-assign', 'task.assign', { taskId, assignee: 'ai-agent' });
      return;
    }
    if (!called.includes('notification.send')) {
      yield* this.callTool('tc-notify', 'notification.send', { target: 'owner', message: '任务已拆解并分配' });
      return;
    }
    yield { type: 'text_delta', delta: 'PM flow completed.' };
    yield { type: 'done', usage: { input: 64, output: 16 } };
  }

  private firstTaskId(messages: readonly LLMMessage[]): string {
    for (const message of messages) {
      if (message.role !== 'tool' || typeof message.content !== 'string') continue;
      try {
        const parsed = JSON.parse(message.content) as { tasks?: Array<{ id?: string }> };
        const id = parsed.tasks?.[0]?.id;
        if (id) return id;
      } catch {
        // Ignore non-JSON content.
      }
    }
    return 'missing';
  }

  private async *callTool(id: string, name: string, params: Record<string, unknown>): AsyncGenerator<LLMStreamChunk> {
    yield { type: 'tool_call_start', id, name };
    yield { type: 'tool_call_delta', id, argumentsDelta: JSON.stringify(params) };
    yield { type: 'tool_call_end', id };
    yield { type: 'done', usage: { input: 80, output: 20 } };
  }
}

describe('Phase 1 PM E2E', () => {
  it('runs requirement decomposition, task assignment and reminder through Tool Gateway', async () => {
    const pipeline = new ToolGatewayPipeline();
    registerPMTools(pipeline);
    const loop = new QueryLoop({
      provider: new PMMockProvider(),
      toolExecutor: new GatewayToolExecutor(pipeline, { approvalPolicy: 'auto', maxRiskLevel: 'R2' }),
      config: {
        maxTurns: 8,
        maxToolCallsPerTurn: 4,
        budgetSnapshot: {
          tokenBudget: { total: 10000, used: 0, remaining: 10000 },
          costBudget: { total: 1, used: 0, remaining: 1 },
          timeBudget: { total: 60000, used: 0, remaining: 60000 },
          stepBudget: { total: 20, used: 0, remaining: 20 },
        },
        abortSignal: new AbortController().signal,
      },
    });

    const events = [];
    for await (const event of loop.run([{ role: 'user', content: '请拆解登录和权限需求并催办' }], 'mock')) {
      events.push(event);
    }

    expect(events.some((event) => event.type === 'tool_use_result' && event.toolName === 'task.decompose')).toBe(true);
    expect(events.some((event) => event.type === 'tool_use_result' && event.toolName === 'task.assign')).toBe(true);
    expect(events.some((event) => event.type === 'tool_use_result' && event.toolName === 'notification.send')).toBe(true);
    expect(events.at(-1)?.type).toBe('completed');
  });
});
