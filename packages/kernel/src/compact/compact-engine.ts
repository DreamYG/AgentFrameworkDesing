import type { CompactResult, LLMMessageRef } from './types.js';
import { TimeGapMicroCompact } from './time-gap-micro.js';
import { EvidenceAwareCompact } from './evidence-aware.js';
import { SessionGraftCompact } from './session-graft.js';
import { LegacyFullCompact } from './legacy-compact.js';
import { EvidenceRegistry, type IEvidencePersister } from './evidence-registry.js';
import type { ILLMProvider } from '@nexus/shared';

export interface CompactEngineOptions {
  readonly provider?: ILLMProvider;
  readonly maxEvidence?: number;
  /** L4 LLM 压缩使用的模型，未提供时回退到 `legacy-compact` 默认 */
  readonly compactModel?: string;
  /** L3 嫁接保留的最近轮数 */
  readonly keepRecentTurns?: number;
  /** 证据持久化端口（生产模式注入） */
  readonly evidencePersister?: IEvidencePersister;
  /** runId/tenantId 用于持久化 */
  readonly runId?: string;
  readonly tenantId?: string;
}

/**
 * Compact Engine — 金字塔级联决策树
 * 70% → L2 → 仍超 80% → L3 → 仍超限 → L4
 * @stability S1
 */
export class CompactEngine {
  readonly registry: EvidenceRegistry;
  private readonly l1: TimeGapMicroCompact;
  private readonly l2: EvidenceAwareCompact;
  private readonly l3: SessionGraftCompact;
  private readonly l4: LegacyFullCompact;

  constructor(options?: CompactEngineOptions) {
    this.registry = new EvidenceRegistry({
      maxEntries: options?.maxEvidence ?? 50,
      persister: options?.evidencePersister,
      runId: options?.runId,
      tenantId: options?.tenantId,
    });
    this.l1 = new TimeGapMicroCompact();
    this.l2 = new EvidenceAwareCompact(this.registry);
    this.l3 = new SessionGraftCompact({ keepRecentTurns: options?.keepRecentTurns });
    this.l4 = new LegacyFullCompact(options?.provider, { compactModel: options?.compactModel, keepRecentTurns: options?.keepRecentTurns });
  }

  /**
   * 决定并执行最合适的 Compact 级别
   */
  async compact(
    messages: LLMMessageRef[],
    contents: string[],
    ctx: { currentTokenCount: number; maxTokens: number; turnIndex: number; sessionSummary?: string | null },
  ): Promise<CompactResult | null> {
    // Always try L1 first (time-gap)
    if (this.l1.shouldCompact({ runId: '', currentTokenCount: ctx.currentTokenCount, maxTokens: ctx.maxTokens, messages })) {
      const result = this.l1.execute(messages, contents);
      if (result.tokensFreed > 0) return result;
    }

    const ratio = ctx.currentTokenCount / ctx.maxTokens;

    // L2 at 70%
    if (ratio >= 0.7) {
      const l2Result = this.l2.execute(messages, contents, ctx.turnIndex);
      const newTokenCount = this.estimateTokens(messages);
      if (newTokenCount / ctx.maxTokens < 0.8) return l2Result;

      // Still over 80% → L3
      const evidenceIndices = this.registry.getMessageIndicesWithEvidence();
      const l3Result = this.l3.execute(messages, contents, ctx.sessionSummary ?? null, evidenceIndices);
      const afterL3 = this.estimateTokens(messages);
      if (afterL3 / ctx.maxTokens < 0.9) return l3Result;

      // Still over → L4
      const evidenceIds = this.registry.getAll().map((e) => e.id);
      const l4Result = await this.l4.execute(messages, contents, evidenceIds);
      return l4Result;
    }

    return null;
  }

  private estimateTokens(messages: readonly LLMMessageRef[]): number {
    return messages.reduce((sum, m) => sum + m.tokenCount, 0);
  }
}
