import type { CompactResult, LLMMessageRef } from './types.js';
import type { ILLMProvider, LLMMessage } from '@nexus/shared';

/**
 * L4 Legacy Full Compact
 * 兜底：当 L1-L3 均无法降至安全水位时，用 LLM 生成压缩摘要
 * @stability S1
 */
export class LegacyFullCompact {
  constructor(private readonly provider?: ILLMProvider) {}

  shouldCompact(currentTokenCount: number, maxTokens: number): boolean {
    return currentTokenCount >= maxTokens * 0.9;
  }

  async execute(
    messages: LLMMessageRef[],
    contents: string[],
    evidenceIds: readonly string[],
  ): Promise<CompactResult> {
    const allContent = contents.filter(Boolean).join('\n---\n');
    let summary: string;

    if (this.provider) {
      const compactPrompt: LLMMessage[] = [
        { role: 'system', content: 'Summarize the following conversation, preserving all evidence IDs and key decisions. Output a concise summary.' },
        { role: 'user', content: `Evidence IDs to preserve: ${evidenceIds.join(', ')}\n\nConversation:\n${allContent.slice(0, 20000)}` },
      ];

      let result = '';
      for await (const chunk of this.provider.chat(compactPrompt, { model: 'compact-model' })) {
        if (chunk.type === 'text_delta') result += chunk.delta;
      }
      summary = result;
    } else {
      summary = `[L4 Compact Summary] ${messages.length} messages compressed. Evidence preserved: ${evidenceIds.join(', ')}. Key content: ${allContent.slice(0, 500)}...`;
    }

    let tokensFreed = 0;
    for (let i = 1; i < messages.length; i++) {
      tokensFreed += messages[i]!.tokenCount;
      contents[i] = '';
      messages[i] = { ...messages[i]!, tokenCount: 0 };
    }

    contents[1] = summary;
    messages[1] = { ...messages[1]!, role: 'user', tokenCount: Math.ceil(summary.length / 4) };

    return { level: 'L4_legacy', tokensFreed, evidencePreserved: evidenceIds.length, durationMs: 0 };
  }
}
