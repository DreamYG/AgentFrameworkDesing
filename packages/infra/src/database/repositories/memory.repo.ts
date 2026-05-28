import { eq } from 'drizzle-orm';
import type { NexusDatabase } from '../client.js';
import { evidenceEntries, sessionSummaries, skills } from '../schema/memory.js';

/**
 * 记忆系统的三个 PG 仓储：
 * - EvidenceEntries: 跨 Compact 保留的证据
 * - SessionSummaries: SessionShadow PG 兜底
 * - Skills: SkillStore PG 后端
 * @stability S2
 */

export interface PersistedEvidenceEntry {
  readonly id: string;
  readonly tenantId: string;
  readonly runId: string;
  readonly sourceToolCall: string;
  readonly messageIndex: number;
  readonly type: string;
  readonly content: string;
  readonly turnCreated: number;
  readonly accessCount: number;
  readonly tokenCount: number;
  readonly wasReferenced: boolean;
}

export class EvidenceEntriesRepository {
  constructor(private readonly db: NexusDatabase) {}

  async upsert(entry: PersistedEvidenceEntry): Promise<void> {
    await this.db.insert(evidenceEntries).values({
      ...entry,
      updatedAt: new Date(),
    }).onConflictDoUpdate({
      target: evidenceEntries.id,
      set: {
        accessCount: entry.accessCount,
        wasReferenced: entry.wasReferenced,
        updatedAt: new Date(),
      },
    });
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(evidenceEntries).where(eq(evidenceEntries.id, id));
  }

  async listByRun(runId: string): Promise<readonly PersistedEvidenceEntry[]> {
    const rows = await this.db.select().from(evidenceEntries).where(eq(evidenceEntries.runId, runId));
    return rows.map((row) => ({
      id: row.id,
      tenantId: row.tenantId,
      runId: row.runId,
      sourceToolCall: row.sourceToolCall,
      messageIndex: row.messageIndex,
      type: row.type,
      content: row.content,
      turnCreated: row.turnCreated,
      accessCount: row.accessCount,
      tokenCount: row.tokenCount,
      wasReferenced: row.wasReferenced,
    }));
  }
}

export interface PersistedSessionSummary {
  readonly runId: string;
  readonly tenantId: string;
  readonly version: number;
  readonly turnStart: number;
  readonly turnEnd: number;
  readonly progressSummary: string;
  readonly confirmedDecisions: readonly string[];
  readonly openQuestions: readonly string[];
  readonly activeEvidenceIds: readonly string[];
  readonly tokenCount: number;
}

export class SessionSummariesRepository {
  constructor(private readonly db: NexusDatabase) {}

  async upsert(summary: PersistedSessionSummary): Promise<void> {
    await this.db.insert(sessionSummaries).values({
      ...summary,
      confirmedDecisions: [...summary.confirmedDecisions],
      openQuestions: [...summary.openQuestions],
      activeEvidenceIds: [...summary.activeEvidenceIds],
      updatedAt: new Date(),
    }).onConflictDoUpdate({
      target: sessionSummaries.runId,
      set: {
        version: summary.version,
        turnStart: summary.turnStart,
        turnEnd: summary.turnEnd,
        progressSummary: summary.progressSummary,
        confirmedDecisions: [...summary.confirmedDecisions],
        openQuestions: [...summary.openQuestions],
        activeEvidenceIds: [...summary.activeEvidenceIds],
        tokenCount: summary.tokenCount,
        updatedAt: new Date(),
      },
    });
  }

  async get(runId: string): Promise<PersistedSessionSummary | null> {
    const rows = await this.db.select().from(sessionSummaries).where(eq(sessionSummaries.runId, runId)).limit(1);
    const row = rows[0];
    if (!row) return null;
    return {
      runId: row.runId,
      tenantId: row.tenantId,
      version: row.version,
      turnStart: row.turnStart,
      turnEnd: row.turnEnd,
      progressSummary: row.progressSummary,
      confirmedDecisions: row.confirmedDecisions,
      openQuestions: row.openQuestions,
      activeEvidenceIds: row.activeEvidenceIds,
      tokenCount: row.tokenCount,
    };
  }
}

export class SkillsRepository {
  constructor(private readonly db: NexusDatabase) {}

  async upsert(skill: {
    id: string;
    tenantId: string;
    title: string;
    content: string;
    l0Summary: string;
    tags: readonly string[];
    evidenceIds: readonly string[];
    dataClassification: string;
    version: number;
    status: string;
  }): Promise<void> {
    await this.db.insert(skills).values({
      ...skill,
      tags: [...skill.tags],
      evidenceIds: [...skill.evidenceIds],
      updatedAt: new Date(),
    }).onConflictDoUpdate({
      target: skills.id,
      set: {
        title: skill.title,
        content: skill.content,
        l0Summary: skill.l0Summary,
        tags: [...skill.tags],
        evidenceIds: [...skill.evidenceIds],
        dataClassification: skill.dataClassification,
        version: skill.version,
        status: skill.status,
        updatedAt: new Date(),
      },
    });
  }

  async search(tenantId: string, query: string) {
    const rows = await this.db.select().from(skills).where(eq(skills.tenantId, tenantId));
    const lower = query.toLowerCase();
    return rows.filter((row) =>
      row.title.toLowerCase().includes(lower) ||
      row.content.toLowerCase().includes(lower) ||
      row.l0Summary.toLowerCase().includes(lower),
    );
  }
}
