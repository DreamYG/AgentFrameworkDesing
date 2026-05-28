import type { ILLMProvider, LLMCallOptions, LLMMessage, LLMStreamChunk } from '@nexus/shared';

/**
 * OpenAI Chat Completions Provider
 * 流式 SSE + Tool Calling，兼容 OpenAI 兼容协议（如 Azure OpenAI、本地 vLLM）
 * @stability S3
 */
export class OpenAIProvider implements ILLMProvider {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(options: { apiKey: string; baseUrl?: string }) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl ?? 'https://api.openai.com/v1';
  }

  async *chat(
    messages: readonly LLMMessage[],
    options: LLMCallOptions,
  ): AsyncGenerator<LLMStreamChunk> {
    const body = this.buildRequestBody(messages, options);

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: options.abortSignal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText} ${text}`);
    }
    if (!response.body) throw new Error('No response body');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let inputTokens = 0;
    let outputTokens = 0;
    const pending = new Map<number, { id: string; name: string }>();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (!data || data === '[DONE]') continue;
          let event: OpenAIStreamEvent;
          try {
            event = JSON.parse(data) as OpenAIStreamEvent;
          } catch {
            continue;
          }

          const choice = event.choices?.[0];
          const delta = choice?.delta;
          if (delta?.content) {
            yield { type: 'text_delta', delta: delta.content };
          }
          if (delta?.tool_calls) {
            for (const toolCall of delta.tool_calls) {
              const index = toolCall.index;
              if (toolCall.id && toolCall.function?.name && !pending.has(index)) {
                pending.set(index, { id: toolCall.id, name: toolCall.function.name });
                yield { type: 'tool_call_start', id: toolCall.id, name: toolCall.function.name };
              }
              const pendingCall = pending.get(index);
              if (pendingCall && toolCall.function?.arguments) {
                yield {
                  type: 'tool_call_delta',
                  id: pendingCall.id,
                  argumentsDelta: toolCall.function.arguments,
                };
              }
            }
          }
          if (choice?.finish_reason && pending.size > 0) {
            for (const call of pending.values()) {
              yield { type: 'tool_call_end', id: call.id };
            }
            pending.clear();
          }
          if (event.usage) {
            inputTokens = event.usage.prompt_tokens ?? inputTokens;
            outputTokens = event.usage.completion_tokens ?? outputTokens;
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    yield { type: 'done', usage: { input: inputTokens, output: outputTokens } };
  }

  /** 生成图片，返回图片 URL 列表。仅 OpenAI 兼容路径可用。 */
  async generateImage(params: {
    prompt: string;
    model?: string;
    size?: '256x256' | '512x512' | '1024x1024' | '1024x1792' | '1792x1024';
    n?: number;
    abortSignal?: AbortSignal;
  }): Promise<{ urls: readonly string[]; model: string }> {
    const model = params.model ?? 'dall-e-3';
    const response = await fetch(`${this.baseUrl}/images/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model,
        prompt: params.prompt,
        size: params.size ?? '1024x1024',
        n: params.n ?? 1,
      }),
      signal: params.abortSignal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`OpenAI image API error: ${response.status} ${response.statusText} ${text}`);
    }

    const payload = await response.json() as { data?: Array<{ url?: string; b64_json?: string }> };
    const urls = (payload.data ?? [])
      .map((item) => item.url ?? (item.b64_json ? `data:image/png;base64,${item.b64_json}` : null))
      .filter((value): value is string => Boolean(value));
    return { urls, model };
  }

  private buildRequestBody(messages: readonly LLMMessage[], options: LLMCallOptions): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model: options.model,
      stream: true,
      stream_options: { include_usage: true },
      messages: messages.map((message) => ({
        role: message.role === 'tool' ? 'tool' : message.role,
        content: typeof message.content === 'string' ? message.content : JSON.stringify(message.content),
        tool_call_id: message.toolCallId,
      })),
    };
    if (options.maxTokens) body['max_tokens'] = options.maxTokens;
    if (options.temperature !== undefined) body['temperature'] = options.temperature;
    if (options.tools && options.tools.length > 0) {
      body['tools'] = options.tools.map((tool) => ({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.inputSchema,
        },
      }));
    }
    return body;
  }
}

interface OpenAIStreamEvent {
  readonly choices?: Array<{
    readonly delta?: {
      readonly content?: string;
      readonly tool_calls?: Array<{
        readonly index: number;
        readonly id?: string;
        readonly function?: { readonly name?: string; readonly arguments?: string };
      }>;
    };
    readonly finish_reason?: string | null;
  }>;
  readonly usage?: {
    readonly prompt_tokens?: number;
    readonly completion_tokens?: number;
  };
}
