import { describe, expect, it } from 'vitest';
import type { ILLMProvider, LLMCallOptions, LLMMessage, LLMStreamChunk, ToolResult } from '@nexus/shared';
import { AgentRuntimeImpl, CheckpointManager, InMemoryCheckpointStore, type ToolExecutor, type LLMToolDef } from '../src/index.js';

class ResumeProvider implements ILLMProvider {
  private callCount = 0;

  async *chat(_messages: readonly LLMMessage[], _options: LLMCallOptions): AsyncGenerator<LLMStreamChunk> {
    this.callCount++;
    if (this.callCount === 1) {
      yield { type: 'tool_call_start', id: 'tc1', name: 'project.query' };
      yield { type: 'tool_call_delta', id: 'tc1', argumentsDelta: '{}' };
      yield { type: 'tool_call_end', id: 'tc1' };
      yield { type: 'done', usage: { input: 10, output: 10 } };
      return;
    }
    yield { type: 'text_delta', delta: 'resumed' };
    yield { type: 'done', usage: { input: 10, output: 5 } };
  }
}

class ResumeToolExecutor implements ToolExecutor {
  async execute(_toolName: string, _args: string, _runId: string): Promise<ToolResult> {
    return { success: true, data: { ok: true }, durationMs: 1 };
  }

  getToolDefs(): readonly LLMToolDef[] {
    return [{ name: 'project.query', description: 'query', inputSchema: { type: 'object' } }];
  }
}

describe('Checkpoint resume', () => {
  it('saves periodic checkpoints and resumes from latest snapshot', async () => {
    const checkpoint = new CheckpointManager({ periodicInterval: 1 });
    const store = new InMemoryCheckpointStore();
    checkpoint.setStore(store);
    const provider = new ResumeProvider();
    const runtime = new AgentRuntimeImpl({
      id: 'agent',
      name: 'Agent',
      description: 'test',
      version: '0.1.0',
      phase: 'intent',
      provider,
      toolExecutor: new ResumeToolExecutor(),
      checkpointManager: checkpoint,
      model: 'mock',
      maxTurns: 2,
    });

    const controller = new AbortController();
    const started = [];
    for await (const event of runtime.start(
      { content: 'start' },
      { runId: 'run-resume', tenantId: 'tenant', userId: 'user', correlationId: 'corr', abortSignal: controller.signal },
    )) {
      started.push(event);
    }

    expect(store.list('run-resume').length).toBeGreaterThan(0);
    const resumed = [];
    for await (const event of runtime.resume('run-resume', { type: 'event_received' })) {
      resumed.push(event);
    }

    expect(started.some((event) => event.type === 'checkpoint')).toBe(true);
    expect(resumed.some((event) => event.type === 'completed')).toBe(true);
  });
});
