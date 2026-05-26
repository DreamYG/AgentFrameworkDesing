import type { CompactContext, CompactResult, LLMMessageRef } from './types.js';

const TIME_GAP_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes
const TOOL_RESULT_SIZE_THRESHOLD = 4096; // 4KB

/**
 * L1 Time-Gap Micro Compact
 * 零 LLM 调用：利用时间间隔作为"认知边界"信号
 * - 相邻消息间隔 >30min → 清理旧工具结果
 * - 工具结果 >4KB → 替换为摘要占位
 */
export class TimeGapMicroCompact {
  shouldCompact(ctx: CompactContext): boolean {
    return this.findStaleMessages(ctx.messages).length > 0;
  }

  execute(ctx: CompactContext): CompactResult {
    const stale = this.findStaleMessages(ctx.messages);
    let tokensFreed = 0;

    for (const msg of stale) {
      tokensFreed += msg.tokenCount;
    }

    return {
      level: 'L1_time_gap',
      tokensFreed,
      evidencePreserved: 0,
      durationMs: 0,
    };
  }

  /**
   * 找出应被清理的消息索引
   * 规则：工具结果消息，且满足以下任一条件：
   * 1. 与下一条消息间隔超过 30 分钟
   * 2. 工具结果大小超过 4KB
   */
  findStaleMessages(messages: readonly LLMMessageRef[]): readonly LLMMessageRef[] {
    const stale: LLMMessageRef[] = [];

    for (let i = 0; i < messages.length - 1; i++) {
      const msg = messages[i]!;
      if (msg.role !== 'tool') continue;

      const next = messages[i + 1]!;
      const gap = next.timestamp.getTime() - msg.timestamp.getTime();

      if (gap > TIME_GAP_THRESHOLD_MS || (msg.toolResultSize ?? 0) > TOOL_RESULT_SIZE_THRESHOLD) {
        stale.push(msg);
      }
    }

    return stale;
  }

  /**
   * 生成清理后的占位文本
   */
  generatePlaceholder(msg: LLMMessageRef): string {
    const time = msg.timestamp.toISOString();
    return `[已清理: ${msg.toolName ?? 'unknown'} at ${time}]`;
  }
}
