import { describe, it, expect } from 'vitest';
import type { AgentStreamEvent, ILLMProvider, LLMCallOptions, LLMMessage, LLMStreamChunk } from '@nexus/shared';
import { QueryLoop } from '../src/query-engine/query-loop.js';
import type { ToolExecutor } from '../src/query-engine/query-loop.js';
import type { LLMToolDef } from '../src/query-engine/types.js';
import { TimeGapMicroCompact } from '../src/compact/time-gap-micro.js';
import { ResilientLoop } from '../src/query-engine/resilient-loop.js';
import { ProviderError } from '@nexus/shared';

/**
 * Mock Provider that simulates:
 * Turn 1: text output + tool call
 * Turn 2: text output only (triggers termination)
 */
class MockProvider implements ILLMProvider {
  private callCount = 0;

  async *chat(
    _messages: readonly LLMMessage[],
    _options: LLMCallOptions,
  ): AsyncGenerator<LLMStreamChunk> {
    this.callCount++;

    if (this.callCount === 1) {
      yield { type: 'text_delta', delta: 'I will call a tool.' };
      yield { type: 'tool_call_start', id: 'tc_1', name: 'test_tool' };
      yield { type: 'tool_call_delta', id: 'tc_1', argumentsDelta: '{"query":"hello"}' };
      yield { type: 'tool_call_end', id: 'tc_1' };
      yield { type: 'done', usage: { input: 100, output: 50 } };
    } else {
      yield { type: 'text_delta', delta: 'Task complete.' };
      yield { type: 'done', usage: { input: 200, output: 30 } };
    }
  }
}

class MockToolExecutor implements ToolExecutor {
  async execute(_toolName: string, _args: string, _runId: string) {
    return { success: true as const, data: { result: 'tool executed' }, durationMs: 10 };
  }

  getToolDefs(): readonly LLMToolDef[] {
    return [
      {
        name: 'test_tool',
        description: 'A test tool',
        inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
      },
    ];
  }
}

describe('QueryLoop', () => {
  it('should complete a full reasoning loop with tool calls', async () => {
    const provider = new MockProvider();
    const toolExecutor = new MockToolExecutor();
    const controller = new AbortController();

    const loop = new QueryLoop(provider, toolExecutor, {
      maxTurns: 10,
      maxToolCallsPerTurn: 5,
      budgetSnapshot: {
        tokenBudget: { total: 10000, used: 0, remaining: 10000 },
        costBudget: { total: 1, used: 0, remaining: 1 },
        timeBudget: { total: 60000, used: 0, remaining: 60000 },
        stepBudget: { total: 20, used: 0, remaining: 20 },
      },
      abortSignal: controller.signal,
    });

    const messages: LLMMessage[] = [
      { role: 'user', content: 'Hello, please use the test tool' },
    ];

    const events: AgentStreamEvent[] = [];
    for await (const event of loop.run(messages, 'mock-model')) {
      events.push(event);
    }

    const textDeltas = events.filter((e) => e.type === 'text_delta');
    expect(textDeltas.length).toBeGreaterThan(0);

    const toolStarts = events.filter((e) => e.type === 'tool_use_start');
    expect(toolStarts.length).toBe(1);

    const toolResults = events.filter((e) => e.type === 'tool_use_result');
    expect(toolResults.length).toBe(1);

    const completed = events.find((e) => e.type === 'completed');
    expect(completed).toBeDefined();
    if (completed && completed.type === 'completed') {
      expect(completed.result.success).toBe(true);
      expect(completed.result.turnsExecuted).toBe(2);
      expect(completed.result.toolCallsCount).toBe(0);
    }
  });
});

describe('TimeGapMicroCompact', () => {
  it('should identify stale messages by time gap', () => {
    const compact = new TimeGapMicroCompact();
    const now = new Date();
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

    const messages = [
      { index: 0, role: 'tool' as const, tokenCount: 500, timestamp: twoHoursAgo, toolName: 'git.diff', toolResultSize: 200 },
      { index: 1, role: 'assistant' as const, tokenCount: 100, timestamp: now },
    ];

    const stale = compact.findStaleMessages(messages);
    expect(stale.length).toBe(1);
    expect(stale[0]!.toolName).toBe('git.diff');
  });

  it('should identify stale messages by size', () => {
    const compact = new TimeGapMicroCompact();
    const now = new Date();

    const messages = [
      { index: 0, role: 'tool' as const, tokenCount: 2000, timestamp: now, toolName: 'code.read', toolResultSize: 5000 },
      { index: 1, role: 'assistant' as const, tokenCount: 100, timestamp: new Date(now.getTime() + 1000) },
    ];

    const stale = compact.findStaleMessages(messages);
    expect(stale.length).toBe(1);
  });

  it('should not flag recent small tool results', () => {
    const compact = new TimeGapMicroCompact();
    const now = new Date();

    const messages = [
      { index: 0, role: 'tool' as const, tokenCount: 100, timestamp: now, toolName: 'task.query', toolResultSize: 200 },
      { index: 1, role: 'assistant' as const, tokenCount: 100, timestamp: new Date(now.getTime() + 1000) },
    ];

    const stale = compact.findStaleMessages(messages);
    expect(stale.length).toBe(0);
  });
});

describe('ResilientLoop', () => {
  it('should classify tool errors correctly', () => {
    const loop = new ResilientLoop(new MockProvider());

    expect(loop.classifyToolError(new Error('Connection timed out'))).toBe('level1_timeout');
    expect(loop.classifyToolError(new Error('Schema validation failed'))).toBe('level2_schema');
    expect(loop.classifyToolError(new Error('Permission denied'))).toBe('level3_permission');
    expect(loop.classifyToolError(new Error('Unknown crash'))).toBe('level4_unrecoverable');
  });

  it('should pass pre-flight check with valid state', () => {
    const loop = new ResilientLoop(new MockProvider());
    const controller = new AbortController();

    const result = loop.preFlightCheck({
      budgetRemaining: 5000,
      currentTokenCount: 1000,
      maxTokens: 100000,
      abortSignal: controller.signal,
    });

    expect(result.pass).toBe(true);
  });

  it('should fail pre-flight check when budget exhausted', () => {
    const loop = new ResilientLoop(new MockProvider());
    const controller = new AbortController();

    const result = loop.preFlightCheck({
      budgetRemaining: 0,
      currentTokenCount: 1000,
      maxTokens: 100000,
      abortSignal: controller.signal,
    });

    expect(result.pass).toBe(false);
    expect(result.reason).toBe('budget_exhausted');
  });

  it('should fallback to secondary provider on failure', async () => {
    const failingProvider: ILLMProvider = {
      async *chat() {
        throw new Error('503 Service Unavailable');
      },
    };

    const fallbackProvider: ILLMProvider = {
      async *chat() {
        yield { type: 'text_delta' as const, delta: 'fallback response' };
        yield { type: 'done' as const, usage: { input: 10, output: 5 } };
      },
    };

    const loop = new ResilientLoop(failingProvider, fallbackProvider, 2);
    const events: (LLMStreamChunk | AgentStreamEvent)[] = [];

    for await (const event of loop.invokeWithFallback([], { model: 'test' }, 'run-1')) {
      events.push(event);
    }

    const fallbackEvent = events.find(
      (e) => 'type' in e && e.type === 'model_fallback',
    );
    expect(fallbackEvent).toBeDefined();
  });
});
