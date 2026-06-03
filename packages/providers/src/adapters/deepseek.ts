import { OpenAIProvider } from './openai.js';

/**
 * DeepSeek Provider
 *
 * DeepSeek 采用 OpenAI 兼容的 Chat Completions 协议（流式 SSE + Tool Calling），
 * 因此直接复用 {@link OpenAIProvider} 的实现，仅替换默认 baseUrl。
 * 支持模型：`deepseek-chat`、`deepseek-reasoner` 等（均以 `deepseek-` 前缀路由）。
 *
 * @stability S3
 */
export class DeepSeekProvider extends OpenAIProvider {
  constructor(options: { apiKey: string; baseUrl?: string }) {
    super({
      apiKey: options.apiKey,
      baseUrl: options.baseUrl ?? 'https://api.deepseek.com/v1',
    });
  }

  /** DeepSeek 不提供图像生成能力。 */
  override async generateImage(): Promise<{ urls: readonly string[]; model: string }> {
    throw new Error('DeepSeek provider does not support image generation');
  }
}
