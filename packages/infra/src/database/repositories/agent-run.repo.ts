import { eq } from 'drizzle-orm';
import type { NexusDatabase } from '../client.js';
import { agentRuns } from '../schema/agent-run.js';

/**
 * AgentRun 仓储：负责 Run 的创建、状态流转、完成。
 * @stability S2
 */
export class AgentRunsRepository {
  constructor(private readonly db: NexusDatabase) {}

  async create(run: {
    id: string;
    tenantId: string;
    agentId: string;
    userId: string;
    correlationId: string;
    input?: Record<string, unknown>;
  }): Promise<void> {
    await this.db.insert(agentRuns).values({
      id: run.id,
      tenantId: run.tenantId,
      agentId: run.agentId,
      userId: run.userId,
      correlationId: run.correlationId,
      input: run.input,
      status: 'running',
    });
  }

  async get(runId: string) {
    const rows = await this.db.select().from(agentRuns).where(eq(agentRuns.id, runId)).limit(1);
    return rows[0] ?? null;
  }

  async updateStatus(runId: string, status: string): Promise<void> {
    await this.db.update(agentRuns).set({ status, updatedAt: new Date() }).where(eq(agentRuns.id, runId));
  }

  async complete(runId: string, output: Record<string, unknown>): Promise<void> {
    await this.db.update(agentRuns).set({
      status: 'succeeded',
      output,
      updatedAt: new Date(),
      completedAt: new Date(),
    }).where(eq(agentRuns.id, runId));
  }
}
