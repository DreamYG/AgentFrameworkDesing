import { NexusError } from './nexus-error.js';

/** 预算耗尽 */
export class BudgetExhaustedError extends NexusError {
  constructor(dimension: string, usage: number, limit: number) {
    super(
      `Budget exhausted: ${dimension} used ${usage}/${limit}`,
      'BUDGET.EXHAUSTED',
      false,
      { dimension, usage, limit },
    );
  }
}
