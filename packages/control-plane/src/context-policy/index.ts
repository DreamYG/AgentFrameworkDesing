/** 上下文策略类型 */
export type ContextStrategy =
  | 'full_context'
  | 'sliding_window'
  | 'summary_prefix'
  | 'rag_augmented'
  | 'checkpoint_restore'
  | 'aggressive_compact';

export interface ContextProfile {
  readonly currentTokenCount: number;
  readonly maxContextWindow: number;
  readonly hasSessionSummary: boolean;
  readonly hasCheckpoint: boolean;
  readonly turnCount: number;
}

export interface ContextDecision {
  readonly strategy: ContextStrategy;
  readonly reason: string;
  readonly params?: Readonly<Record<string, unknown>>;
}

/**
 * IContextPolicy — 上下文工程策略端口
 * @stability S2
 */
export interface IContextPolicy {
  decide(profile: ContextProfile): ContextDecision;
}

/**
 * 默认上下文策略实现
 * 根据当前 token 占比自动选择策略
 */
export class DefaultContextPolicy implements IContextPolicy {
  decide(profile: ContextProfile): ContextDecision {
    const ratio = profile.currentTokenCount / profile.maxContextWindow;

    if (ratio < 0.5) {
      return { strategy: 'full_context', reason: 'Context under 50%, full context safe' };
    }

    if (ratio < 0.8) {
      return {
        strategy: 'sliding_window',
        reason: 'Context 50-80%, using sliding window',
        params: { keepRecentTurns: Math.max(5, profile.turnCount - 3) },
      };
    }

    if (profile.hasSessionSummary) {
      return {
        strategy: 'summary_prefix',
        reason: 'Context >80% with session summary available',
      };
    }

    if (profile.hasCheckpoint) {
      return {
        strategy: 'checkpoint_restore',
        reason: 'Context >80%, restoring from checkpoint',
      };
    }

    return {
      strategy: 'aggressive_compact',
      reason: 'Context >80%, no summary or checkpoint, aggressive compact required',
    };
  }
}
