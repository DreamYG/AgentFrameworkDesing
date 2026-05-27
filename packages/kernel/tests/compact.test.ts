import { describe, it, expect } from 'vitest';
import { EvidenceRegistry } from '../src/compact/evidence-registry.js';
import { CompactEngine } from '../src/compact/compact-engine.js';
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
});
