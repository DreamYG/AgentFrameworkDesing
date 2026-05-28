import type { ILLMProvider, LLMCallOptions, LLMMessage, LLMStreamChunk } from '@nexus/shared';

export interface ProviderRouterEntry {
  /** 匹配模型名前缀，例如 'claude-' / 'gpt-' / 'local-' */
  readonly prefix: string;
  readonly provider: ILLMProvider;
  readonly label: string;
}

/**
 * 按 model 名前缀把请求路由到正确的 LLM Provider。
 * 用于支持每个 Agent 独立选择模型/Provider。
 * @stability S3
 */
export class ProviderRouter implements ILLMProvider {
  constructor(
    private readonly entries: readonly ProviderRouterEntry[],
    private readonly fallback: ILLMProvider,
  ) {}

  async *chat(messages: readonly LLMMessage[], options: LLMCallOptions): AsyncGenerator<LLMStreamChunk> {
    const provider = this.resolve(options.model);
    yield* provider.chat(messages, options);
  }

  resolve(model: string): ILLMProvider {
    const entry = this.entries.find((item) => model.startsWith(item.prefix));
    return entry ? entry.provider : this.fallback;
  }

  describe(model: string): string {
    const entry = this.entries.find((item) => model.startsWith(item.prefix));
    return entry?.label ?? 'fallback';
  }
}
