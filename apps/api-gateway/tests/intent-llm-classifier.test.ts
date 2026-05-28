import { describe, expect, it } from 'vitest';
import type { ILLMProvider, LLMCallOptions, LLMMessage, LLMStreamChunk } from '@nexus/shared';
import { LLMIntentClassifierImpl } from '../src/intent/llm-classifier.js';

class StaticProvider implements ILLMProvider {
  constructor(private readonly script: string) {}
  async *chat(_messages: readonly LLMMessage[], _options: LLMCallOptions): AsyncGenerator<LLMStreamChunk> {
    yield { type: 'text_delta', delta: this.script };
    yield { type: 'done', usage: { input: 10, output: 10 } };
  }
}

class ThrowingProvider implements ILLMProvider {
  async *chat(_messages: readonly LLMMessage[], _options: LLMCallOptions): AsyncGenerator<LLMStreamChunk> {
    throw new Error('llm offline');
  }
}

class RecordingProvider implements ILLMProvider {
  readonly seenMessages: LLMMessage[][] = [];
  constructor(private readonly script: string) {}
  async *chat(messages: readonly LLMMessage[], _options: LLMCallOptions): AsyncGenerator<LLMStreamChunk> {
    this.seenMessages.push([...messages]);
    yield { type: 'text_delta', delta: this.script };
    yield { type: 'done', usage: { input: 10, output: 10 } };
  }
}

describe('LLMIntentClassifierImpl', () => {
  const candidates = [
    { id: 'requirement-analyst', phase: 'intent' as const, description: '需求分析', capabilities: ['doc.read'] },
    { id: 'task-planner', phase: 'intent' as const, description: '任务拆解', capabilities: ['task.decompose'], modelTier: 'low' as const },
  ];

  it('parses strict JSON output and returns the decision', async () => {
    const classifier = new LLMIntentClassifierImpl(
      new StaticProvider('{"agentId":"task-planner","phase":"intent","confidence":0.78,"reason":"WBS"}'),
      { model: 'gpt-4o-mini' },
    );
    const decision = await classifier.classify({ text: '帮我拆解需求', candidates });
    expect(decision?.agentId).toBe('task-planner');
    expect(decision?.confidence).toBeCloseTo(0.78, 5);
    expect(decision?.reason).toBe('WBS');
  });

  it('extracts JSON embedded in extra text', async () => {
    const classifier = new LLMIntentClassifierImpl(
      new StaticProvider('好的，分类结果：\n{"agentId":"requirement-analyst","confidence":0.6}\n以上'),
      { model: 'gpt-4o-mini' },
    );
    const decision = await classifier.classify({ text: '分析一下需求', candidates });
    expect(decision?.agentId).toBe('requirement-analyst');
  });

  it('returns null when LLM picks an unknown agentId', async () => {
    const classifier = new LLMIntentClassifierImpl(
      new StaticProvider('{"agentId":"unknown-agent","confidence":0.99}'),
      { model: 'gpt-4o-mini' },
    );
    const decision = await classifier.classify({ text: '...', candidates });
    expect(decision).toBeNull();
  });

  it('returns null when provider throws', async () => {
    const classifier = new LLMIntentClassifierImpl(new ThrowingProvider(), { model: 'gpt-4o-mini' });
    const decision = await classifier.classify({ text: '...', candidates });
    expect(decision).toBeNull();
  });

  it('returns null when output has no JSON object', async () => {
    const classifier = new LLMIntentClassifierImpl(
      new StaticProvider('I am not sure how to classify this.'),
      { model: 'gpt-4o-mini' },
    );
    const decision = await classifier.classify({ text: '...', candidates });
    expect(decision).toBeNull();
  });

  it('parses intentType when LLM returns it', async () => {
    const classifier = new LLMIntentClassifierImpl(
      new StaticProvider('{"agentId":"task-planner","intentType":"task","confidence":0.7}'),
      { model: 'gpt-4o-mini' },
    );
    const decision = await classifier.classify({ text: 'WBS now', candidates });
    expect(decision?.intentType).toBe('task');
  });

  it('rejects an unknown intentType value but keeps the rest of the decision', async () => {
    const classifier = new LLMIntentClassifierImpl(
      new StaticProvider('{"agentId":"task-planner","intentType":"emoji","confidence":0.7}'),
      { model: 'gpt-4o-mini' },
    );
    const decision = await classifier.classify({ text: 'x', candidates });
    expect(decision?.intentType).toBeUndefined();
    expect(decision?.agentId).toBe('task-planner');
  });

  it('injects few-shot examples and modelTier into the prompt', async () => {
    const provider = new RecordingProvider('{"agentId":"task-planner","confidence":0.9}');
    const classifier = new LLMIntentClassifierImpl(provider, {
      model: 'gpt-4o-mini',
      costSensitive: true,
      fewShotExamples: [
        { text: '帮我拆 WBS', decision: { agentId: 'task-planner', confidence: 0.95 } },
      ],
    });
    await classifier.classify({ text: '拆解一下任务', candidates, tenantId: 'tenant-A' });
    expect(provider.seenMessages.length).toBe(1);
    const [system, user] = provider.seenMessages[0]!;
    expect(system!.content).toContain('帮我拆 WBS');
    expect(system!.content).toContain('modelTier=low');
    expect(user!.content).toContain('modelTier=low');
    expect(user!.content).toContain('租户：tenant-A');
  });
});
