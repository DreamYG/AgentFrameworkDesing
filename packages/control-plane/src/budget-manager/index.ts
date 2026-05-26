import type { BudgetDimension, BudgetSnapshot, BudgetState } from '@nexus/shared';

export interface BudgetConfig {
  readonly tokenLimit: number;
  readonly costLimitUsd: number;
  readonly timeLimitMs: number;
  readonly stepLimit: number;
}

/**
 * Budget Manager — 四维预算管理
 * Token、成本、时间、步数四个独立维度，任一耗尽即触发降级或熔断
 * @stability S2
 */
export class BudgetManager {
  private tokenUsed = 0;
  private costUsed = 0;
  private timeUsed = 0;
  private stepsUsed = 0;
  private readonly startTime: number;

  constructor(private readonly config: BudgetConfig) {
    this.startTime = Date.now();
  }

  recordTokens(input: number, output: number): void {
    this.tokenUsed += input + output;
  }

  recordCost(amount: number): void {
    this.costUsed += amount;
  }

  recordStep(): void {
    this.stepsUsed++;
  }

  updateTime(): void {
    this.timeUsed = Date.now() - this.startTime;
  }

  getState(): BudgetState {
    this.updateTime();
    const snapshot = this.getSnapshot();
    const warningDimensions: string[] = [];

    if (snapshot.tokenBudget.remaining / snapshot.tokenBudget.total < 0.2) {
      warningDimensions.push('token');
    }
    if (snapshot.costBudget.remaining / snapshot.costBudget.total < 0.15) {
      warningDimensions.push('cost');
    }
    if (snapshot.timeBudget.remaining / snapshot.timeBudget.total < 0.1) {
      warningDimensions.push('time');
    }
    if (snapshot.stepBudget.remaining <= 3) {
      warningDimensions.push('step');
    }

    return {
      snapshot,
      isExhausted: this.isExhausted(),
      warningDimensions,
    };
  }

  getSnapshot(): BudgetSnapshot {
    this.updateTime();
    return {
      tokenBudget: this.makeDimension(this.config.tokenLimit, this.tokenUsed),
      costBudget: this.makeDimension(this.config.costLimitUsd, this.costUsed),
      timeBudget: this.makeDimension(this.config.timeLimitMs, this.timeUsed),
      stepBudget: this.makeDimension(this.config.stepLimit, this.stepsUsed),
    };
  }

  isExhausted(): boolean {
    this.updateTime();
    return (
      this.tokenUsed >= this.config.tokenLimit ||
      this.costUsed >= this.config.costLimitUsd ||
      this.timeUsed >= this.config.timeLimitMs ||
      this.stepsUsed >= this.config.stepLimit
    );
  }

  /** 获取推荐的模型降级动作 */
  getDowngradeAction(): 'none' | 'use_lighter_model' | 'use_mini_model' | 'fast_complete' | 'stop' {
    const tokenRatio = this.tokenUsed / this.config.tokenLimit;
    const costRatio = this.costUsed / this.config.costLimitUsd;

    if (tokenRatio >= 0.95 || costRatio >= 0.95) return 'stop';
    if (tokenRatio >= 0.8 || costRatio >= 0.8) return 'fast_complete';
    if (tokenRatio >= 0.6 || costRatio >= 0.6) return 'use_lighter_model';
    return 'none';
  }

  private makeDimension(total: number, used: number): BudgetDimension {
    return { total, used, remaining: Math.max(0, total - used) };
  }
}
