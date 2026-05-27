import type { CompactContext, CompactResult, LLMMessageRef } from './types.js';
import { EvidenceRegistry } from './evidence-registry.js';

/**
 * L2 Evidence-Aware Compact
 * 触发：Token >= 70% 窗口
 * 扫描所有工具结果，证据保留完整，非证据压缩为单行摘要
 * @stability S1
 */
export class EvidenceAwareCompact {
  constructor(private readonly registry: EvidenceRegistry) {}

  shouldCompact(ctx: CompactContext): boolean {
    return ctx.currentTokenCount >= ctx.maxTokens * 0.7;
  }

  execute(messages: LLMMessageRef[], contents: string[], turnIndex: number): CompactResult {
    let tokensFreed = 0;
    let evidencePreserved = 0;

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i]!;
      if (msg.role !== 'tool') continue;

      const content = contents[i] ?? '';
      const evidence = this.registry.scanAndRegister(content, msg.toolName ?? 'unknown', turnIndex, i);

      if (evidence.length > 0) {
        evidencePreserved += evidence.length;
        for (const e of evidence) e.wasReferenced = true;
      } else {
        const summary = `[Tool ${msg.toolName ?? 'unknown'}: completed, ${msg.tokenCount} tokens]`;
        tokensFreed += msg.tokenCount - Math.ceil(summary.length / 4);
        contents[i] = summary;
        messages[i] = { ...msg, tokenCount: Math.ceil(summary.length / 4) };
      }
    }

    return { level: 'L2_evidence', tokensFreed, evidencePreserved, durationMs: 0 };
  }
}
