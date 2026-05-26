/** 预算状态快照 */
export interface BudgetSnapshot {
  readonly tokenBudget: BudgetDimension;
  readonly costBudget: BudgetDimension;
  readonly timeBudget: BudgetDimension;
  readonly stepBudget: BudgetDimension;
}

export interface BudgetDimension {
  readonly total: number;
  readonly used: number;
  readonly remaining: number;
}

/** 预算运行时状态 */
export interface BudgetState {
  readonly snapshot: BudgetSnapshot;
  readonly isExhausted: boolean;
  readonly warningDimensions: readonly string[];
}
