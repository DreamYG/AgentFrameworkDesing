import { describe, it, expect } from 'vitest';
import { EvidenceRegistry } from '../src/compact/evidence-registry.js';
import { CompactEngine } from '../src/compact/compact-engine.js';
import { SessionGraftCompact } from '../src/compact/session-graft.js';
import { LegacyFullCompact } from '../src/compact/legacy-compact.js';
import type { LLMMessageRef } from '../src/compact/types.js';

describe('EvidenceRegistry', () => {
  it('scans file paths and URLs with messageIndex', () => {
    const registry = new EvidenceRegistry();
    const entries = registry.scanAndRegister(
      'See /etc/nginx/conf.d/app.conf and https://example.com/api',
      'shell.execute',
      1,
      3,
    );
    expect(entries.length).toBeGreaterThanOrEqual(2);
    expect(entries.every((e) => e.messageIndex === 3)).toBe(true);
  });

  it('evicts expired entries with no access and no references', () => {
    const registry = new EvidenceRegistry({ ttlTurns: 1 });
    registry.scanAndRegister('file /tmp/a.txt', 'tool', 0, 1);
    expect(registry.count()).toBe(1);
    registry.evict(5);
    expect(registry.count()).toBe(0);
  });

  it('preserves referenced entries past TTL', () => {
    const registry = new EvidenceRegistry({ ttlTurns: 1 });
    const [entry] = registry.scanAndRegister('file /tmp/b.txt', 'tool', 0, 1);
    if (entry) entry.wasReferenced = true;
    registry.evict(10);
    expect(registry.count()).toBe(1);
  });

  it('exposes message indices for L3 graft', () => {
    const registry = new EvidenceRegistry();
    registry.scanAndRegister('file /a/b.json', 'tool', 0, 2);
    registry.scanAndRegister('file /c/d.json', 'tool', 0, 5);
    const indices = registry.getMessageIndicesWithEvidence();
    expect(indices.has(2)).toBe(true);
    expect(indices.has(5)).toBe(true);
    expect(indices.has(99)).toBe(false);
  });

  it('mirrors scanAndRegister + evict to the injected persister', async () => {
    const upserts: string[] = [];
    const deletes: string[] = [];
    const registry = new EvidenceRegistry({
      ttlTurns: 1,
      runId: 'run-A',
      tenantId: 'tenant-A',
      persister: {
        async upsert(entry) { upserts.push(entry.id); },
        async delete(id) { deletes.push(id); },
        async listByRun() { return []; },
      },
    });
    const entries = registry.scanAndRegister('see /tmp/x.txt', 'tool', 0, 1);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(upserts.length).toBe(entries.length);
    registry.evict(10);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(deletes.length).toBe(entries.length);
  });

  it('loadFromPersister restores entries on resume', async () => {
    const registry = new EvidenceRegistry({
      runId: 'run-A',
      tenantId: 'tenant-A',
      persister: {
        async upsert() {},
        async delete() {},
        async listByRun() {
          return [{
            id: 'ev-1',
            sourceToolCall: 'tool',
            messageIndex: 7,
            type: 'file_path',
            content: '/tmp/saved.txt',
            turnCreated: 1,
            accessCount: 0,
            tokenCount: 4,
            wasReferenced: true,
          }];
        },
      },
    });
    await registry.loadFromPersister('run-A');
    expect(registry.count()).toBe(1);
    expect(registry.get('ev-1')?.content).toContain('/tmp/saved.txt');
  });
});

describe('CompactEngine cascading', () => {
  function makeMessages(count: number, sizePerMsg: number): { refs: LLMMessageRef[]; contents: string[] } {
    const refs: LLMMessageRef[] = [];
    const contents: string[] = [];
    for (let i = 0; i < count; i++) {
      const role = i === 0 ? 'system' : i % 2 === 0 ? 'tool' : 'assistant';
      refs.push({
        index: i,
        role,
        tokenCount: sizePerMsg,
        timestamp: new Date(Date.now() - (count - i) * 1000),
        toolName: role === 'tool' ? 'mock' : undefined,
        toolResultSize: role === 'tool' ? sizePerMsg * 4 : undefined,
      });
      contents.push(role === 'tool' ? `mock tool result number ${i}` : 'turn ' + i);
    }
    return { refs, contents };
  }

  it('returns null when below 70% threshold and no time gap', async () => {
    const engine = new CompactEngine();
    const { refs, contents } = makeMessages(4, 100);
    const result = await engine.compact(refs, contents, {
      currentTokenCount: 500,
      maxTokens: 10000,
      turnIndex: 1,
    });
    expect(result).toBeNull();
  });

  it('runs L2 evidence-aware when ratio exceeds 70%', async () => {
    const engine = new CompactEngine();
    const { refs, contents } = makeMessages(10, 100);
    const result = await engine.compact(refs, contents, {
      currentTokenCount: 750,
      maxTokens: 1000,
      turnIndex: 1,
    });
    expect(result?.level).toBe('L2_evidence');
  });

  it('runs L3 session graft when summary is available', () => {
    const { refs, contents } = makeMessages(16, 100);
    const graft = new SessionGraftCompact({ keepRecentTurns: 2 });
    const result = graft.execute(refs, contents, '当前会话摘要', new Set([2]));

    expect(result.level).toBe('L3_session_graft');
    expect(contents[1]).toContain('<session_summary>');
    expect(refs.some((ref) => ref.tokenCount === 0)).toBe(true);
  });

  it('runs L4 legacy fallback and preserves evidence ids', async () => {
    const { refs, contents } = makeMessages(12, 120);
    const legacy = new LegacyFullCompact();
    const result = await legacy.execute(refs, contents, ['evidence-1']);

    expect(result.level).toBe('L4_legacy');
    expect(result.evidencePreserved).toBe(1);
    expect(contents[1]).toContain('evidence-1');
  });

  it('L4 cache-friendly: keeps messages[0] system intact and last N turns', async () => {
    const { refs, contents } = makeMessages(20, 100);
    const originalSystem = contents[0]!;
    const originalLast = contents[contents.length - 1]!;
    const originalLastSecond = contents[contents.length - 2]!;
    const legacy = new LegacyFullCompact(undefined, { keepRecentTurns: 3 });
    await legacy.execute(refs, contents, []);

    expect(contents[0]).toBe(originalSystem);
    expect(refs[0]!.role).toBe('system');
    // recent turns kept (last 6 messages = 3 turns * 2)
    expect(contents[contents.length - 1]).toBe(originalLast);
    expect(contents[contents.length - 2]).toBe(originalLastSecond);
    // compacted slice is now a system-role summary at index 1
    expect(contents[1]).toContain('<compacted_summary>');
    expect(refs[1]!.role).toBe('system');
  });

  it('L4 uses the configured compactModel when calling the provider', async () => {
    const seen: string[] = [];
    const provider = {
      async *chat(_msgs: readonly unknown[], opts: { model: string }) {
        seen.push(opts.model);
        yield { type: 'text_delta' as const, delta: 'compressed' };
        yield { type: 'done' as const, usage: { input: 1, output: 1 } };
      },
    };
    const { refs, contents } = makeMessages(20, 100);
    const legacy = new LegacyFullCompact(provider as never, { compactModel: 'gpt-4o-mini' });
    await legacy.execute(refs, contents, []);
    expect(seen).toEqual(['gpt-4o-mini']);
  });
});
