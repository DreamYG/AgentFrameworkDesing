import type { CompactResult, LLMMessageRef } from './types.js';
import type { ILLMProvider, LLMMessage } from '@nexus/shared';

const DEFAULT_COMPACT_MODEL = 'claude-haiku-4-5';
const DEFAULT_KEEP_RECENT_TURNS = 4;

export interface LegacyFullCompactOptions {
  /** 用于 LLM 调用的小模型；未提供时退回 DEFAULT_COMPACT_MODEL */
  readonly compactModel?: string;
  /** 最近保留多少轮对话（用户+助手算 2 条），其余压缩为单条 system 摘要 */
  readonly keepRecentTurns?: number;
}

/**
 * L4 Legacy Full Compact
 * 兜底：当 L1-L3 均无法降至安全水位时，用 LLM 生成压缩摘要。
 *
 * Cache-friendly 改写策略（v3.0）：
 * - 保留 messages[0] 不变（system，stable_prefix 不破坏）
 * - 保留最近 keepRecentTurns*2 条不变（最新上下文）
 * - 中间消息全部替换为单条 system 角色 `<compacted_summary>...</compacted_summary>`
 *   - 角色用 system 而非 user，保持对话角色序列连贯
 *   - 内容包含 evidence ids 链接，模型可按需要 ai.skill.search / 引用
 * @stability S1
 */
export class LegacyFullCompact {
  private readonly compactModel: string;
  private readonly keepRecentTurns: number;

  constructor(private readonly provider?: ILLMProvider, options?: LegacyFullCompactOptions) {
    this.compactModel = options?.compactModel ?? DEFAULT_COMPACT_MODEL;
    this.keepRecentTurns = options?.keepRecentTurns ?? DEFAULT_KEEP_RECENT_TURNS;
  }

  shouldCompact(currentTokenCount: number, maxTokens: number): boolean {
    return currentTokenCount >= maxTokens * 0.9;
  }

  async execute(
    messages: LLMMessageRef[],
    contents: string[],
    evidenceIds: readonly string[],
  ): Promise<CompactResult> {
    if (messages.length <= 2) {
      return { level: 'L4_legacy', tokensFreed: 0, evidencePreserved: evidenceIds.length, durationMs: 0 };
    }

    const keepFromTail = this.keepRecentTurns * 2;
    const compactEnd = Math.max(1, messages.length - keepFromTail);
    if (compactEnd <= 1) {
      return { level: 'L4_legacy', tokensFreed: 0, evidencePreserved: evidenceIds.length, durationMs: 0 };
    }

    const compactSlice = contents.slice(1, compactEnd).filter(Boolean).join('\n---\n').slice(0, 20000);
    const summary = this.provider
      ? await this.llmSummarize(compactSlice, evidenceIds)
      : this.fallbackSummarize(messages.slice(1, compactEnd).length, evidenceIds, compactSlice);

    let tokensFreed = 0;
    for (let i = 1; i < compactEnd; i++) {
      tokensFreed += messages[i]!.tokenCount;
      contents[i] = '';
      messages[i] = { ...messages[i]!, tokenCount: 0 };
    }

    const wrappedSummary = `<compacted_summary>\n${summary}\n\nEvidence IDs (preserved across compact): ${evidenceIds.join(', ') || 'none'}\n</compacted_summary>`;
    contents[1] = wrappedSummary;
    messages[1] = {
      ...messages[1]!,
      role: 'system',
      tokenCount: Math.ceil(wrappedSummary.length / 4),
    };

    return { level: 'L4_legacy', tokensFreed, evidencePreserved: evidenceIds.length, durationMs: 0 };
  }

  private async llmSummarize(content: string, evidenceIds: readonly string[]): Promise<string> {
    const compactPrompt: LLMMessage[] = [
      {
        role: 'system',
        content: 'Summarize the following conversation. Preserve all evidence IDs and key decisions. Output a concise summary in 5-10 bullet points. Do not include the word "summary" itself.',
      },
      { role: 'user', content: `Evidence IDs to preserve: ${evidenceIds.join(', ')}\n\nConversation:\n${content}` },
    ];
    let result = '';
    try {
      for await (const chunk of this.provider!.chat(compactPrompt, { model: this.compactModel })) {
        if (chunk.type === 'text_delta') result += chunk.delta;
      }
    } catch {
      return this.fallbackSummarize(0, evidenceIds, content);
    }
    return result || this.fallbackSummarize(0, evidenceIds, content);
  }

  private fallbackSummarize(messageCount: number, evidenceIds: readonly string[], content: string): string {
    return `${messageCount} messages compressed. Evidence preserved: ${evidenceIds.join(', ') || 'none'}. Excerpt: ${content.slice(0, 500)}...`;
  }
}
