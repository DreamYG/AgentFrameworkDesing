import type { CompactContext, CompactResult, LLMMessageRef } from './types.js';

const TIME_GAP_THRESHOLD_MS = 30 * 60 * 1000;
const TOOL_RESULT_SIZE_THRESHOLD = 4096;

/**
 * L1 Time-Gap Micro Compact
 * 零 LLM 调用：利用时间间隔作为"认知边界"信号
 * @stability S1
 */
export class TimeGapMicroCompact {
  shouldCompact(ctx: CompactContext): boolean {
    return this.findStaleIndices(ctx.messages).length > 0;
  }

  /**
   * 执行压缩 — 实际修改消息数组，将旧工具结果替换为 placeholder
   */
  execute(messages: LLMMessageRef[], mutableContents: string[]): CompactResult {
    const staleIndices = this.findStaleIndices(messages);
    let tokensFreed = 0;

    for (const idx of staleIndices) {
      const msg = messages[idx]!;
      tokensFreed += msg.tokenCount;
      const placeholder = this.generatePlaceholder(msg);
      mutableContents[idx] = placeholder;
      messages[idx] = { ...msg, tokenCount: Math.ceil(placeholder.length / 4), toolResultSize: placeholder.length };
    }

    return {
      level: 'L1_time_gap',
      tokensFreed,
      evidencePreserved: 0,
      durationMs: 0,
    };
  }

  findStaleIndices(messages: readonly LLMMessageRef[]): readonly number[] {
    const stale: number[] = [];

    for (let i = 0; i < messages.length - 1; i++) {
      const msg = messages[i]!;
      if (msg.role !== 'tool') continue;

      const next = messages[i + 1]!;
      const gap = next.timestamp.getTime() - msg.timestamp.getTime();

      if (gap > TIME_GAP_THRESHOLD_MS || (msg.toolResultSize ?? 0) > TOOL_RESULT_SIZE_THRESHOLD) {
        stale.push(i);
      }
    }

    return stale;
  }

  findStaleMessages(messages: readonly LLMMessageRef[]): readonly LLMMessageRef[] {
    return this.findStaleIndices(messages).map((i) => messages[i]!);
  }

  generatePlaceholder(msg: LLMMessageRef): string {
    const time = msg.timestamp.toISOString();
    return `[已清理: ${msg.toolName ?? 'unknown'} at ${time}]`;
  }
}
