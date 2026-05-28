import { eq } from 'drizzle-orm';
import type { NexusDatabase } from '../client.js';
import { approvalRequests } from '../schema/approval.js';

/**
 * R2+ 审批请求仓储。
 * @stability S2
 */
export class ApprovalRequestsRepository {
  constructor(private readonly db: NexusDatabase) {}

  async create(request: {
    id: string;
    tenantId: string;
    runId: string;
    toolName: string;
    toolParams: Record<string, unknown>;
    riskLevel: string;
    reason: string;
    approvers: readonly string[];
    requiredApprovals: number;
    deadline: Date;
  }): Promise<void> {
    await this.db.insert(approvalRequests).values({
      ...request,
      approvers: [...request.approvers],
    });
  }

  async updateStatus(requestId: string, status: string, decidedBy?: string): Promise<void> {
    await this.db
      .update(approvalRequests)
      .set({ status, decidedBy, decidedAt: new Date() })
      .where(eq(approvalRequests.id, requestId));
  }
}
