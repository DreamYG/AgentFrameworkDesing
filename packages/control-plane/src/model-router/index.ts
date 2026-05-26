import type { BudgetState } from '@nexus/shared';

export type TaskType = 'reasoning' | 'coding' | 'analysis' | 'creative' | 'simple';
export type LatencyRequirement = 'realtime' | 'interactive' | 'batch';
export type QualityRequirement = 'best' | 'good' | 'acceptable';

export interface ModelRoutingRequest {
  readonly taskType: TaskType;
  readonly remainingBudget: BudgetState;
  readonly latencyRequirement: LatencyRequirement;
  readonly qualityRequirement: QualityRequirement;
  readonly contextSize: number;
}

export interface ModelDecision {
  readonly modelId: string;
  readonly reason: string;
  readonly fallback?: string;
  readonly estimatedCost: number;
}

export interface ModelConfig {
  readonly id: string;
  readonly tier: 'premium' | 'standard' | 'lightweight' | 'mini';
  readonly costPerInputToken: number;
  readonly costPerOutputToken: number;
  readonly maxContextWindow: number;
  readonly latencyMs: number;
}

/**
 * Model Router — 模型路由策略
 * 根据任务类型、预算、延迟、质量要求选择最优模型
 * @stability S2
 */
export class ModelRouter {
  private readonly models: ModelConfig[] = [];

  registerModel(config: ModelConfig): void {
    this.models.push(config);
  }

  route(request: ModelRoutingRequest): ModelDecision {
    const downgrade = this.getBudgetDowngrade(request.remainingBudget);
    const candidates = this.filterCandidates(request, downgrade);

    if (candidates.length === 0) {
      const fallback = this.models.find((m) => m.tier === 'mini') ?? this.models[0];
      return {
        modelId: fallback?.id ?? 'unknown',
        reason: 'No suitable model found, using fallback',
        estimatedCost: 0,
      };
    }

    const selected = candidates[0]!;
    const fallback = candidates.length > 1 ? candidates[1] : undefined;

    return {
      modelId: selected.id,
      reason: `Selected based on task=${request.taskType}, quality=${request.qualityRequirement}`,
      fallback: fallback?.id,
      estimatedCost: selected.costPerInputToken * request.contextSize,
    };
  }

  private getBudgetDowngrade(budget: BudgetState): 'premium' | 'standard' | 'lightweight' | 'mini' {
    const tokenRatio = budget.snapshot.tokenBudget.used / budget.snapshot.tokenBudget.total;
    const costRatio = budget.snapshot.costBudget.used / budget.snapshot.costBudget.total;
    const maxRatio = Math.max(tokenRatio, costRatio);

    if (maxRatio >= 0.95) return 'mini';
    if (maxRatio >= 0.8) return 'lightweight';
    if (maxRatio >= 0.6) return 'standard';
    return 'premium';
  }

  private filterCandidates(request: ModelRoutingRequest, maxTier: string): ModelConfig[] {
    const tierOrder = ['premium', 'standard', 'lightweight', 'mini'];
    const maxIdx = tierOrder.indexOf(maxTier);

    return this.models
      .filter((m) => {
        const tierIdx = tierOrder.indexOf(m.tier);
        if (tierIdx > maxIdx) return false;
        if (m.maxContextWindow < request.contextSize) return false;
        if (request.latencyRequirement === 'realtime' && m.latencyMs > 5000) return false;
        if (request.latencyRequirement === 'interactive' && m.latencyMs > 30000) return false;
        return true;
      })
      .sort((a, b) => {
        if (request.qualityRequirement === 'best') {
          return tierOrder.indexOf(a.tier) - tierOrder.indexOf(b.tier);
        }
        return a.costPerInputToken - b.costPerInputToken;
      });
  }
}
