/** LLM 消息格式 */
export interface LLMMessage {
  readonly role: 'system' | 'user' | 'assistant' | 'tool';
  readonly content: string | readonly ContentPart[];
  readonly toolCallId?: string;
  readonly toolCalls?: readonly ToolCall[];
  readonly timestamp?: Date;
}

export interface ContentPart {
  readonly type: 'text' | 'image';
  readonly text?: string;
  readonly imageUrl?: string;
}

export interface ToolCall {
  readonly id: string;
  readonly name: string;
  readonly arguments: string;
}

/** LLM Provider 端口 — kernel 通过此端口调用 LLM */
export interface ILLMProvider {
  chat(
    messages: readonly LLMMessage[],
    options: LLMCallOptions,
  ): AsyncGenerator<LLMStreamChunk>;
}

export interface LLMCallOptions {
  readonly model: string;
  readonly tools?: readonly LLMToolDef[];
  readonly maxTokens?: number;
  readonly temperature?: number;
  readonly abortSignal?: AbortSignal;
}

export interface LLMToolDef {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
}

export type LLMStreamChunk =
  | { readonly type: 'text_delta'; readonly delta: string }
  | { readonly type: 'tool_call_start'; readonly id: string; readonly name: string }
  | { readonly type: 'tool_call_delta'; readonly id: string; readonly argumentsDelta: string }
  | { readonly type: 'tool_call_end'; readonly id: string }
  | { readonly type: 'done'; readonly usage: { input: number; output: number } };
