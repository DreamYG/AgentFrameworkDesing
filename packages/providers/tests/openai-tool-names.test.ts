import { describe, expect, it } from 'vitest';
import {
  buildOpenAIToolNameMap,
  decodeToolNameFromOpenAI,
  encodeToolNameForOpenAI,
} from '../src/openai-tool-names.js';

describe('openai-tool-names', () => {
  it('encodes dotted Nexus tool names to OpenAI-safe identifiers', () => {
    expect(encodeToolNameForOpenAI('ai.chat')).toBe('ai_chat');
    expect(encodeToolNameForOpenAI('task.decompose')).toBe('task_decompose');
    expect(encodeToolNameForOpenAI('task_update')).toBe('task_update');
  });

  it('round-trips via buildOpenAIToolNameMap', () => {
    const map = buildOpenAIToolNameMap([
      { name: 'ai.chat' },
      { name: 'project.query' },
    ]);
    expect(map.toApi.get('ai.chat')).toBe('ai_chat');
    expect(decodeToolNameFromOpenAI('ai_chat', map)).toBe('ai.chat');
    expect(decodeToolNameFromOpenAI('project_query', map)).toBe('project.query');
  });
});
