import { afterEach, describe, expect, it, vi } from 'vitest';
import { DeepSeekProvider } from '../src/adapters/deepseek.js';

function sseResponse(lines: readonly string[]): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      for (const line of lines) {
        controller.enqueue(encoder.encode(`data: ${line}\n`));
      }
      controller.enqueue(encoder.encode('data: [DONE]\n'));
      controller.close();
    },
  });
  return new Response(body, { status: 200, statusText: 'OK' });
}

describe('DeepSeekProvider', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls the DeepSeek base URL by default and streams text deltas', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      sseResponse([
        JSON.stringify({ choices: [{ delta: { content: '你好' } }] }),
        JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 5, completion_tokens: 2 } }),
      ]),
    );
    vi.stubGlobal('fetch', fetchMock);

    const provider = new DeepSeekProvider({ apiKey: 'sk-test' });
    const chunks: string[] = [];
    for await (const chunk of provider.chat([{ role: 'user', content: 'hi' }], { model: 'deepseek-chat' })) {
      if (chunk.type === 'text_delta') chunks.push(chunk.delta);
    }

    expect(chunks.join('')).toBe('你好');
    const calledUrl = fetchMock.mock.calls[0]?.[0] as string;
    expect(calledUrl).toBe('https://api.deepseek.com/v1/chat/completions');
  });

  it('encodes dotted tool names in the request body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(sseResponse([]));
    vi.stubGlobal('fetch', fetchMock);

    const provider = new DeepSeekProvider({ apiKey: 'sk-test' });
    for await (const _chunk of provider.chat(
      [{ role: 'user', content: 'hi' }],
      {
        model: 'deepseek-chat',
        tools: [{ name: 'ai.chat', description: 'chat', inputSchema: { type: 'object' } }],
      },
    )) {
      // drain
    }

    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string) as {
      tools?: Array<{ function?: { name?: string } }>;
    };
    expect(body.tools?.[0]?.function?.name).toBe('ai_chat');
  });

  it('honours a custom base URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(sseResponse([]));
    vi.stubGlobal('fetch', fetchMock);

    const provider = new DeepSeekProvider({ apiKey: 'sk-test', baseUrl: 'https://proxy.example.com/v1' });
    for await (const _chunk of provider.chat([{ role: 'user', content: 'hi' }], { model: 'deepseek-reasoner' })) {
      // drain
    }

    const calledUrl = fetchMock.mock.calls[0]?.[0] as string;
    expect(calledUrl).toBe('https://proxy.example.com/v1/chat/completions');
  });

  it('rejects image generation', async () => {
    const provider = new DeepSeekProvider({ apiKey: 'sk-test' });
    await expect(provider.generateImage()).rejects.toThrow('does not support image generation');
  });
});
