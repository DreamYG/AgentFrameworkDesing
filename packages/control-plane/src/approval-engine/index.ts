import type { ToolRiskLevel } from '@nexus/shared';

export type ApprovalStatus = 'pending' | 'approved' | 'denied' | 'timeout';

export interface ApprovalRequest {
  readonly id: string;
  readonly runId: string;
  readonly tenantId: string;
  readonly toolName: string;
  readonly toolParams: Readonly<Record<string, unknown>>;
  readonly riskLevel: ToolRiskLevel;
  readonly reason: string;
  readonly approvers: readonly string[];
  readonly requiredApprovals: number;
  readonly deadline: Date;
  readonly approvedBy: readonly string[];
  status: ApprovalStatus;
  readonly createdAt: Date;
  decidedAt?: Date;
  decidedBy?: string;
}

/**
 * Approval Engine — 审批引擎
 * R2+ 工具调用进入审批流程，审批通过后 resume AgentRun
 * @stability S2
 */
export class ApprovalEngine {
  private readonly requests = new Map<string, ApprovalRequest>();
  private onApproved?: (request: ApprovalRequest) => void;
  private onDenied?: (request: ApprovalRequest) => void;
  private onTimedOut?: (request: ApprovalRequest) => void;

  onApproval(handler: (request: ApprovalRequest) => void): void {
    this.onApproved = handler;
  }

  onDenial(handler: (request: ApprovalRequest) => void): void {
    this.onDenied = handler;
  }

  onTimeout(handler: (request: ApprovalRequest) => void): void {
    this.onTimedOut = handler;
  }

  shouldRequireApproval(riskLevel: ToolRiskLevel, policy: 'auto' | 'standard' | 'strict'): boolean {
    if (policy === 'strict') return riskLevel !== 'R0';
    if (policy === 'standard') return riskLevel === 'R2' || riskLevel === 'R3' || riskLevel === 'R4' || riskLevel === 'RX';
    return riskLevel === 'R3' || riskLevel === 'R4' || riskLevel === 'RX';
  }

  createRequest(params: {
    runId: string;
    tenantId: string;
    toolName: string;
    toolParams: Record<string, unknown>;
    riskLevel: ToolRiskLevel;
    reason: string;
    approvers: string[];
    timeoutMs: number;
  }): ApprovalRequest {
    const request: ApprovalRequest = {
      id: crypto.randomUUID(),
      runId: params.runId,
      tenantId: params.tenantId,
      toolName: params.toolName,
      toolParams: params.toolParams,
      riskLevel: params.riskLevel,
      reason: params.reason,
      approvers: params.approvers,
      requiredApprovals: params.riskLevel === 'R4' ? 2 : 1,
      deadline: new Date(Date.now() + params.timeoutMs),
      approvedBy: [],
      status: 'pending',
      createdAt: new Date(),
    };
    this.requests.set(request.id, request);
    return request;
  }

  approve(requestId: string, approver: string): void {
    const request = this.requests.get(requestId);
    if (!request || request.status !== 'pending') return;
    if (!request.approvers.includes(approver)) return;

    const approvedBy = new Set(request.approvedBy);
    approvedBy.add(approver);
    (request as { approvedBy: readonly string[] }).approvedBy = [...approvedBy];
    request.decidedBy = approver;

    if (approvedBy.size < request.requiredApprovals) return;

    request.status = 'approved';
    request.decidedAt = new Date();
    this.onApproved?.(request);
  }

  deny(requestId: string, approver: string): void {
    const request = this.requests.get(requestId);
    if (!request || request.status !== 'pending') return;
    request.status = 'denied';
    request.decidedAt = new Date();
    request.decidedBy = approver;
    this.onDenied?.(request);
  }

  checkTimeout(requestId: string): boolean {
    const request = this.requests.get(requestId);
    if (!request || request.status !== 'pending') return false;
    if (new Date() > request.deadline) {
      request.status = 'timeout';
      request.decidedAt = new Date();
      this.onTimedOut?.(request);
      return true;
    }
    return false;
  }

  getRequest(requestId: string): ApprovalRequest | undefined {
    return this.requests.get(requestId);
  }

  getPendingByRun(runId: string): readonly ApprovalRequest[] {
    return [...this.requests.values()].filter(
      (r) => r.runId === runId && r.status === 'pending',
    );
  }

  getPending(): readonly ApprovalRequest[] {
    return [...this.requests.values()].filter((request) => request.status === 'pending');
  }

  getAll(): readonly ApprovalRequest[] {
    return [...this.requests.values()];
  }

  checkAllTimeouts(): readonly ApprovalRequest[] {
    const timedOut: ApprovalRequest[] = [];
    for (const request of this.requests.values()) {
      if (this.checkTimeout(request.id)) {
        timedOut.push(request);
      }
    }
    return timedOut;
  }
}
