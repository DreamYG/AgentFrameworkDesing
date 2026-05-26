import type { ILLMProvider, LLMCallOptions, LLMMessage, LLMStreamChunk } from '@nexus/shared';

/**
 * Anthropic Claude Provider 适配器
 * 流式调用 + Tool Calling
 * @stability S3
 */
export class AnthropicProvider implements ILLMProvider {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(options: { apiKey: string; baseUrl?: string }) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl ?? 'https://api.anthropic.com';
  }

  async *chat(
    messages: readonly LLMMessage[],
    options: LLMCallOptions,
  ): AsyncGenerator<LLMStreamChunk> {
    const body = this.buildRequestBody(messages, options);

    const response = await fetch(`${this.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
      signal: options.abortSignal,
    });

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.status} ${response.statusText}`);
    }

    if (!response.body) {
      throw new Error('No response body');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let inputTokens = 0;
    let outputTokens = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);
          if (data === '[DONE]') continue;

          try {
            const event = JSON.parse(data) as AnthropicStreamEvent;
            yield* this.processEvent(event);

            if (event.type === 'message_start' && event.message?.usage) {
              inputTokens = event.message.usage.input_tokens ?? 0;
            }
            if (event.type === 'message_delta' && event.usage) {
              outputTokens = event.usage.output_tokens ?? 0;
            }
          } catch {
            // Skip malformed JSON lines
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    yield { type: 'done', usage: { input: inputTokens, output: outputTokens } };
  }

  private *processEvent(event: AnthropicStreamEvent): Generator<LLMStreamChunk> {
    switch (event.type) {
      case 'content_block_start':
        if (event.content_block?.type === 'tool_use') {
          yield {
            type: 'tool_call_start',
            id: event.content_block.id ?? '',
            name: event.content_block.name ?? '',
          };
        }
        break;
      case 'content_block_delta':
        if (event.delta?.type === 'text_delta') {
          yield { type: 'text_delta', delta: event.delta.text ?? '' };
        } else if (event.delta?.type === 'input_json_delta') {
          yield {
            type: 'tool_call_delta',
            id: event.index?.toString() ?? '0',
            argumentsDelta: event.delta.partial_json ?? '',
          };
        }
        break;
      case 'content_block_stop':
        if (event.index !== undefined) {
          yield { type: 'tool_call_end', id: event.index.toString() };
        }
        break;
    }
  }

  private buildRequestBody(
    messages: readonly LLMMessage[],
    options: LLMCallOptions,
  ): Record<string, unknown> {
    const systemMessage = messages.find((m) => m.role === 'system');
    const nonSystemMessages = messages.filter((m) => m.role !== 'system');

    const body: Record<string, unknown> = {
      model: options.model,
      max_tokens: options.maxTokens ?? 4096,
      stream: true,
      messages: nonSystemMessages.map((m) => ({
        role: m.role === 'tool' ? 'user' : m.role,
        content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
      })),
    };

    if (systemMessage) {
      body['system'] = typeof systemMessage.content === 'string'
        ? systemMessage.content
        : JSON.stringify(systemMessage.content);
    }

    if (options.tools && options.tools.length > 0) {
      body['tools'] = options.tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.inputSchema,
      }));
    }

    if (options.temperature !== undefined) {
      body['temperature'] = options.temperature;
    }

    return body;
  }
}

interface AnthropicStreamEvent {
  type: string;
  message?: { usage?: { input_tokens?: number } };
  usage?: { output_tokens?: number };
  index?: number;
  content_block?: { type?: string; id?: string; name?: string };
  delta?: { type?: string; text?: string; partial_json?: string };
}
