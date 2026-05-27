export interface ConsoleRunView {
  readonly runId: string;
  readonly agentId: string;
  readonly status: string;
  readonly tenantId: string;
  readonly createdAt: Date;
  readonly costUsd?: number;
}

export interface ConsoleApprovalView {
  readonly requestId: string;
  readonly runId: string;
  readonly toolName: string;
  readonly riskLevel: string;
  readonly status: string;
}

export interface ConsoleAuditView {
  readonly id: string;
  readonly runId: string;
  readonly eventType: string;
  readonly timestamp: Date;
  readonly data: Readonly<Record<string, unknown>>;
}

export interface ConsoleBudgetView {
  readonly runId: string;
  readonly tokenRemaining: number;
  readonly stepRemaining: number;
  readonly exhausted: boolean;
}

export interface ConsolePackView {
  readonly packId: string;
  readonly name: string;
  readonly version: string;
  readonly status: string;
}

/** Console MVP 数据适配层：Run 列表、审批、审计、预算、Pack 启停 */
export class ConsoleModel {
  private readonly runs: ConsoleRunView[] = [];
  private readonly approvals: ConsoleApprovalView[] = [];
  private readonly audits: ConsoleAuditView[] = [];
  private readonly budgets = new Map<string, ConsoleBudgetView>();
  private readonly packs = new Map<string, ConsolePackView>();

  listRuns(): readonly ConsoleRunView[] {
    return this.runs;
  }

  upsertRun(run: ConsoleRunView): void {
    const index = this.runs.findIndex((item) => item.runId === run.runId);
    if (index >= 0) this.runs[index] = run;
    else this.runs.push(run);
  }

  listApprovals(): readonly ConsoleApprovalView[] {
    return this.approvals;
  }

  upsertApproval(approval: ConsoleApprovalView): void {
    const index = this.approvals.findIndex((item) => item.requestId === approval.requestId);
    if (index >= 0) this.approvals[index] = approval;
    else this.approvals.push(approval);
  }

  listAudit(runId?: string): readonly ConsoleAuditView[] {
    return runId ? this.audits.filter((item) => item.runId === runId) : this.audits;
  }

  appendAudit(entry: ConsoleAuditView): void {
    this.audits.push(entry);
  }

  listBudgets(): readonly ConsoleBudgetView[] {
    return [...this.budgets.values()];
  }

  upsertBudget(budget: ConsoleBudgetView): void {
    this.budgets.set(budget.runId, budget);
  }

  listPacks(): readonly ConsolePackView[] {
    return [...this.packs.values()];
  }

  upsertPack(pack: ConsolePackView): void {
    this.packs.set(pack.packId, pack);
  }

  setPackStatus(packId: string, status: string): void {
    const pack = this.packs.get(packId);
    if (!pack) return;
    this.packs.set(packId, { ...pack, status });
  }
}
