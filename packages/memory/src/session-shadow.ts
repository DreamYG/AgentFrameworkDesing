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

export interface SessionTurnDelta {
  readonly turnIndex: number;
  readonly progress?: string;
  readonly confirmedDecisionsDelta?: readonly string[];
  readonly resolvedQuestions?: readonly string[];
  readonly newQuestions?: readonly string[];
  readonly newEvidenceIds?: readonly string[];
}

/** SessionShadow — post_sampling 异步摘要，Redis CAS 幂等写入 + 反膨胀 */
export class SessionShadow {
  private readonly ttlMs: number;

  constructor(
    private readonly store: RedisLikeSessionStore,
    options?: { ttlMs?: number },
  ) {
    this.ttlMs = options?.ttlMs ?? 24 * 60 * 60 * 1000;
  }

  async update(runId: string, delta: SessionTurnDelta): Promise<SessionSummary> {
    const key = this.key(runId);
    const current = (await this.store.get<SessionSummary>(key)) ?? this.emptySummary();
    const next = this.deflate(this.merge(current, delta));
    const ok = await this.store.compareAndSwap(key, current.version, next, next.version, this.ttlMs);
    if (ok) return next;

    const latest = (await this.store.get<SessionSummary>(key)) ?? current;
    const retried = this.deflate(this.merge(latest, delta));
    await this.store.set(key, retried, this.ttlMs);
    return retried;
  }

  async get(runId: string): Promise<SessionSummary | null> {
    return this.store.get<SessionSummary>(this.key(runId));
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
