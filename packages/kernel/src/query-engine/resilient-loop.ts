import type { AgentStreamEvent } from '@nexus/shared';
import { ProviderError } from '@nexus/shared';
import type { ILLMProvider, LLMCallOptions, LLMMessage, LLMStreamChunk } from './types.js';

/**
 * Resilient Loop — 韧性推理循环引擎
 * 包裹每轮 LLM 调用的 Phase A-D 四阶段防御层
 * @stability S1
 */
export class ResilientLoop {
  constructor(
    private readonly primaryProvider: ILLMProvider,
    private readonly fallbackProvider?: ILLMProvider,
    private readonly maxRetries: number = 3,
  ) {}

  /**
   * Phase A: Pre-Flight Check
   * 每轮循环开始前检查预算、上下文、取消信号
   */
  preFlightCheck(options: {
    budgetRemaining: number;
    currentTokenCount: number;
    maxTokens: number;
    abortSignal: AbortSignal;
  }): PreFlightResult {
    if (options.abortSignal.aborted) {
      return { pass: false, reason: 'abort_signal' };
    }
    if (options.budgetRemaining <= 0) {
      return { pass: false, reason: 'budget_exhausted' };
    }
    if (options.currentTokenCount >= options.maxTokens * 0.95) {
      return { pass: false, reason: 'context_overflow_imminent' };
    }
    return { pass: true };
  }

  /**
   * Phase B: Model Invocation with Fallback
   * 主模型调用失败时的降级链
   */
  async *invokeWithFallback(
    messages: readonly LLMMessage[],
    options: LLMCallOptions,
    runId: string,
  ): AsyncGenerator<LLMStreamChunk | AgentStreamEvent> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const provider = attempt < this.maxRetries ? this.primaryProvider : this.fallbackProvider;
        if (!provider) throw lastError ?? new Error('No provider available');

        if (attempt > 0 && provider === this.fallbackProvider) {
          const fallbackEvent: AgentStreamEvent = {
            type: 'model_fallback',
            from: 'primary',
            to: 'fallback',
            reason: lastError?.message ?? 'Primary provider failed',
            runId,
          };
          yield fallbackEvent;
        }

        const stream = provider.chat(messages, options);
        for await (const chunk of stream) {
          yield chunk;
        }
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (!this.isRetryable(lastError)) {
          throw new ProviderError(
            `Non-retryable provider error: ${lastError.message}`,
            false,
            { reason: 'non_retryable', attempt, originalError: lastError.message },
          );
        }

        if (attempt < this.maxRetries) {
          const delay = Math.min(1000 * 2 ** attempt, 8000);
          await this.sleep(delay);
        }
      }
    }

    throw new ProviderError(
      `All provider attempts exhausted: ${lastError?.message}`,
      false,
      { reason: 'exhausted', maxRetries: this.maxRetries },
    );
  }

  /**
   * Phase C: Tool Execution with Self-Healing
   * 工具异常分级处理（在 QueryLoop 层实现，此处提供分类逻辑）
   */
  classifyToolError(error: Error): ToolErrorLevel {
    const msg = error.message.toLowerCase();
    if (msg.includes('timeout') || msg.includes('timed out')) return 'level1_timeout';
    if (msg.includes('schema') || msg.includes('validation')) return 'level2_schema';
    if (msg.includes('permission') || msg.includes('forbidden')) return 'level3_permission';
    return 'level4_unrecoverable';
  }

  /**
   * Phase D: Post-Turn Bookkeeping
   * 由 QueryLoop 在每轮结束后调用（预算更新、事件发射等）
   */

  private isRetryable(error: Error): boolean {
    const msg = error.message.toLowerCase();
    return (
      msg.includes('429') ||
      msg.includes('500') ||
      msg.includes('503') ||
      msg.includes('timeout') ||
      msg.includes('econnreset') ||
      msg.includes('rate limit')
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export type ToolErrorLevel =
  | 'level1_timeout'
  | 'level2_schema'
  | 'level3_permission'
  | 'level4_unrecoverable';

export interface PreFlightResult {
  readonly pass: boolean;
  readonly reason?: string;
}
