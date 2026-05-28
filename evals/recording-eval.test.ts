import { describe, expect, it } from 'vitest';
import { ReplayLLMProvider } from './replay-provider.js';

describe('Replay evaluation fixtures', () => {
  it('replays deterministic model chunks', async () => {
    const provider = new ReplayLLMProvider([
      { chunks: [{ type: 'text_delta', delta: 'ok' }, { type: 'done', usage: { input: 1, output: 1 } }] },
    ]);
    const chunks = [];
    for await (const chunk of provider.chat([], { model: 'replay' })) {
      chunks.push(chunk);
    }
    expect(chunks.map((chunk) => chunk.type)).toEqual(['text_delta', 'done']);
  });
});
