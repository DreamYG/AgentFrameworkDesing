import { describe, it, expect } from 'vitest';
import { SessionShadow, type ISessionSummaryPersister, type RedisLikeSessionStore, type SessionSummary } from '../src/session-shadow.js';

function makeStore(): RedisLikeSessionStore & { snapshot(): Record<string, SessionSummary> } {
  const data = new Map<string, SessionSummary>();
  return {
    async get<T>(key: string) {
      return (data.get(key) ?? null) as T | null;
    },
    async set<T>(key: string, value: T) {
      data.set(key, value as unknown as SessionSummary);
    },
    async compareAndSwap<T>(key, expectedVersion, newValue, _newVersion) {
      const current = data.get(key);
      if ((current?.version ?? 0) !== expectedVersion) return false;
      data.set(key, newValue as unknown as SessionSummary);
      return true;
    },
    snapshot() {
      return Object.fromEntries(data);
    },
  };
}

describe('SessionShadow', () => {
  it('appends progress and bumps version monotonically', async () => {
    const store = makeStore();
    const shadow = new SessionShadow(store);

    const first = await shadow.update('run-1', { turnIndex: 1, progress: 'analyzed requirements' });
    expect(first.version).toBe(1);

    const second = await shadow.update('run-1', { turnIndex: 2, progress: 'decomposed tasks' });
    expect(second.version).toBe(2);
    expect(second.progressSummary).toContain('decomposed tasks');
  });

  it('deflates confirmedDecisions to last 10 unique items', async () => {
    const shadow = new SessionShadow(makeStore());
    const decisions = Array.from({ length: 15 }, (_, i) => `decision-${i}`);

    let summary = await shadow.update('run-1', {
      turnIndex: 1,
      confirmedDecisionsDelta: decisions,
    });
    expect(summary.confirmedDecisions.length).toBe(10);

    summary = await shadow.update('run-1', {
      turnIndex: 2,
      confirmedDecisionsDelta: ['decision-14', 'decision-extra'],
    });
    expect(new Set(summary.confirmedDecisions).size).toBe(summary.confirmedDecisions.length);
  });

  it('removes resolved open questions', async () => {
    const shadow = new SessionShadow(makeStore());
    await shadow.update('run-1', { turnIndex: 1, newQuestions: ['Q1', 'Q2'] });
    const after = await shadow.update('run-1', { turnIndex: 2, resolvedQuestions: ['Q1'] });
    expect(after.openQuestions).toEqual(['Q2']);
  });

  it('returns retried summary when CAS conflicts (concurrent write)', async () => {
    const store = makeStore();
    const shadow = new SessionShadow(store);
    // 直接预置一个版本，模拟并发覆盖
    await store.set('session_summary:run-2', {
      version: 5,
      turnRange: [0, 0],
      progressSummary: '',
      confirmedDecisions: [],
      openQuestions: [],
      activeEvidenceIds: [],
      tokenCount: 0,
    } as SessionSummary);

    const result = await shadow.update('run-2', { turnIndex: 6, progress: 'late update' });
    expect(result.progressSummary).toContain('late update');
  });

  it('mirrors updates to the PG persister and falls back to it on Redis miss', async () => {
    const pg = new Map<string, SessionSummary>();
    const persister: ISessionSummaryPersister = {
      async upsert(input) {
        pg.set(input.runId, {
          version: input.version,
          turnRange: [input.turnStart, input.turnEnd],
          progressSummary: input.progressSummary,
          confirmedDecisions: input.confirmedDecisions,
          openQuestions: input.openQuestions,
          activeEvidenceIds: input.activeEvidenceIds,
          tokenCount: input.tokenCount,
        });
      },
      async get(runId) {
        return pg.get(runId) ?? null;
      },
    };

    const store = makeStore();
    const shadow = new SessionShadow(store, { persister, tenantId: 'tenant-A' });
    await shadow.update('run-pg', { turnIndex: 1, progress: 'first' });
    // Allow fire-and-forget persistence to settle
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(pg.get('run-pg')?.progressSummary).toContain('first');

    const coldStore = makeStore();
    const coldShadow = new SessionShadow(coldStore, { persister, tenantId: 'tenant-A' });
    const fallback = await coldShadow.get('run-pg');
    expect(fallback?.progressSummary).toContain('first');
    // After fallback, Redis cache should be warmed
    expect(coldStore.snapshot()['session_summary:run-pg']?.progressSummary).toContain('first');
  });
});
