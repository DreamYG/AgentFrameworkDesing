export interface SessionSummary {
  readonly version: number;
  readonly turnRange: readonly [number, number];
  readonly progressSummary: string;
  readonly confirmedDecisions: readonly string[];
  readonly openQuestions: readonly string[];
  readonly activeEvidenceIds: readonly string[];
  readonly tokenCount: number;
}

export interface RedisLikeSessionStore {
  get<T>(key: string): Promise<T | null>;
  compareAndSwap<T>(
    key: string,
    expectedVersion: number,
    newValue: T,
    newVersion: number,
    ttlMs?: number,
  ): Promise<boolean>;
  set<T>(key: string, value: T, ttlMs?: number): Promise<void>;
}

/** PG 兜底持久化端口；Redis 重启不丢 */
export interface ISessionSummaryPersister {
  upsert(input: {
    runId: string;
    tenantId: string;
    version: number;
    turnStart: number;
    turnEnd: number;
    progressSummary: string;
    confirmedDecisions: readonly string[];
    openQuestions: readonly string[];
    activeEvidenceIds: readonly string[];
    tokenCount: number;
  }): Promise<void>;
  get(runId: string): Promise<SessionSummary | null>;
}

export interface SessionTurnDelta {
  readonly turnIndex: number;
  readonly progress?: string;
  readonly confirmedDecisionsDelta?: readonly string[];
  readonly resolvedQuestions?: readonly string[];
  readonly newQuestions?: readonly string[];
  readonly newEvidenceIds?: readonly string[];
}

/** SessionShadow — post_sampling 异步摘要，Redis CAS 幂等写入 + PG 兜底 */
export class SessionShadow {
  private readonly ttlMs: number;
  private readonly persister?: ISessionSummaryPersister;
  private readonly tenantId?: string;

  constructor(
    private readonly store: RedisLikeSessionStore,
    options?: { ttlMs?: number; persister?: ISessionSummaryPersister; tenantId?: string },
  ) {
    this.ttlMs = options?.ttlMs ?? 24 * 60 * 60 * 1000;
    this.persister = options?.persister;
    this.tenantId = options?.tenantId;
  }

  async update(runId: string, delta: SessionTurnDelta): Promise<SessionSummary> {
    const key = this.key(runId);
    const current = (await this.store.get<SessionSummary>(key)) ?? this.emptySummary();
    const next = this.deflate(this.merge(current, delta));
    const ok = await this.store.compareAndSwap(key, current.version, next, next.version, this.ttlMs);
    const finalSummary = ok ? next : await this.casRetry(key, delta);
    this.persistAsync(runId, finalSummary);
    return finalSummary;
  }

  async get(runId: string): Promise<SessionSummary | null> {
    const cached = await this.store.get<SessionSummary>(this.key(runId));
    if (cached) return cached;
    if (!this.persister) return null;
    const fromDb = await this.persister.get(runId);
    if (fromDb) {
      // Warm Redis cache so后续读不再 fallback
      await this.store.set(this.key(runId), fromDb, this.ttlMs);
    }
    return fromDb;
  }

  private async casRetry(key: string, delta: SessionTurnDelta): Promise<SessionSummary> {
    const latest = (await this.store.get<SessionSummary>(key)) ?? this.emptySummary();
    const retried = this.deflate(this.merge(latest, delta));
    await this.store.set(key, retried, this.ttlMs);
    return retried;
  }

  private persistAsync(runId: string, summary: SessionSummary): void {
    if (!this.persister || !this.tenantId) return;
    void this.persister.upsert({
      runId,
      tenantId: this.tenantId,
      version: summary.version,
      turnStart: summary.turnRange[0],
      turnEnd: summary.turnRange[1],
      progressSummary: summary.progressSummary,
      confirmedDecisions: summary.confirmedDecisions,
      openQuestions: summary.openQuestions,
      activeEvidenceIds: summary.activeEvidenceIds,
      tokenCount: summary.tokenCount,
    });
  }

  private merge(current: SessionSummary, delta: SessionTurnDelta): SessionSummary {
    const openQuestions = [
      ...current.openQuestions.filter((q) => !(delta.resolvedQuestions ?? []).includes(q)),
      ...(delta.newQuestions ?? []),
    ];

    return {
      version: current.version + 1,
      turnRange: [current.turnRange[0] || delta.turnIndex, delta.turnIndex],
      progressSummary: [current.progressSummary, delta.progress].filter(Boolean).join('\n').slice(-1000),
      confirmedDecisions: [...current.confirmedDecisions, ...(delta.confirmedDecisionsDelta ?? [])],
      openQuestions,
      activeEvidenceIds: [...new Set([...current.activeEvidenceIds, ...(delta.newEvidenceIds ?? [])])],
      tokenCount: current.tokenCount,
    };
  }

  private deflate(summary: SessionSummary): SessionSummary {
    const confirmedDecisions = [...new Set(summary.confirmedDecisions)].slice(-10);
    const openQuestions = [...new Set(summary.openQuestions)].slice(-10);
    const progressSummary = summary.progressSummary.length > 500
      ? summary.progressSummary.slice(-500)
      : summary.progressSummary;

    return {
      ...summary,
      progressSummary,
      confirmedDecisions,
      openQuestions,
      activeEvidenceIds: summary.activeEvidenceIds.slice(-50),
      tokenCount: Math.ceil(
        (progressSummary.length + confirmedDecisions.join('').length + openQuestions.join('').length) / 4,
      ),
    };
  }

  private emptySummary(): SessionSummary {
    return {
      version: 0,
      turnRange: [0, 0],
      progressSummary: '',
      confirmedDecisions: [],
      openQuestions: [],
      activeEvidenceIds: [],
      tokenCount: 0,
    };
  }

  private key(runId: string): string {
    return `session_summary:${runId}`;
  }
}
