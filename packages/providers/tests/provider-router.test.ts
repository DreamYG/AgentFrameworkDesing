import { describe, expect, it } from 'vitest';
import type { ILLMProvider, LLMCallOptions, LLMMessage, LLMStreamChunk } from '@nexus/shared';
import { ProviderRouter } from '../src/provider-router.js';

class FakeProvider implements ILLMProvider {
  readonly seen: string[] = [];
  constructor(private readonly label: string) {}

  async *chat(_messages: readonly LLMMessage[], options: LLMCallOptions): AsyncGenerator<LLMStreamChunk> {
    this.seen.push(options.model);
    yield { type: 'text_delta', delta: `${this.label}:${options.model}` };
    yield { type: 'done', usage: { input: 1, output: 1 } };
  }
}

describe('ProviderRouter', () => {
  it('routes models to the matching prefix provider and falls back when missing', async () => {
    const anthropic = new FakeProvider('a');
    const openai = new FakeProvider('o');
    const local = new FakeProvider('l');
    const router = new ProviderRouter(
      [
        { prefix: 'claude-', provider: anthropic, label: 'anthropic' },
        { prefix: 'gpt-', provider: openai, label: 'openai' },
      ],
      local,
    );

    const collect = async (model: string): Promise<string> => {
      let out = '';
      for await (const chunk of router.chat([], { model })) {
        if (chunk.type === 'text_delta') out += chunk.delta;
      }
      return out;
    };

    expect(await collect('claude-sonnet-4-5')).toBe('a:claude-sonnet-4-5');
    expect(await collect('gpt-4o')).toBe('o:gpt-4o');
    expect(await collect('local-mvp')).toBe('l:local-mvp');
    expect(router.describe('gpt-4o')).toBe('openai');
    expect(router.describe('unknown-model')).toBe('fallback');
  });
});
