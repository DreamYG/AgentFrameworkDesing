import type { CompactResult, LLMMessageRef } from './types.js';

/**
 * L3 Session Memory Graft
 * 触发：Token >= 80% 窗口
 * 读取 SessionShadow 摘要，替换前半段消息为摘要 + 保留证据 + 最近 N 轮
 * @stability S1
 */
export class SessionGraftCompact {
  private readonly keepRecentTurns: number;

  constructor(options?: { keepRecentTurns?: number }) {
    this.keepRecentTurns = options?.keepRecentTurns ?? 5;
  }

  shouldCompact(currentTokenCount: number, maxTokens: number): boolean {
    return currentTokenCount >= maxTokens * 0.8;
  }

  execute(
    messages: LLMMessageRef[],
    contents: string[],
    sessionSummary: string | null,
    evidenceMessageIndices: ReadonlySet<number>,
  ): CompactResult {
    if (!sessionSummary) {
      return { level: 'L3_session_graft', tokensFreed: 0, evidencePreserved: 0, durationMs: 0 };
    }

    const keepFrom = Math.max(0, messages.length - this.keepRecentTurns * 2);
    let tokensFreed = 0;
    let evidencePreserved = 0;

    for (let i = 1; i < keepFrom; i++) {
      const msg = messages[i]!;
      if (msg.role === 'system') continue;

      if (evidenceMessageIndices.has(i)) {
        evidencePreserved++;
        continue;
      }

      tokensFreed += msg.tokenCount;
      contents[i] = '';
      messages[i] = { ...msg, tokenCount: 0 };
    }

    const graftContent = `<session_summary>\n${sessionSummary}\n</session_summary>`;
    if (messages.length > 1) {
      contents[1] = graftContent;
      messages[1] = { ...messages[1]!, role: 'user', tokenCount: Math.ceil(graftContent.length / 4) };
    }

    return { level: 'L3_session_graft', tokensFreed, evidencePreserved, durationMs: 0 };
  }
}
