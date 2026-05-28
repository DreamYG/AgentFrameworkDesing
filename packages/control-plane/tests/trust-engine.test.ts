import { describe, expect, it } from 'vitest';
import { TrustEngine } from '../src/trust-engine/index.js';

describe('TrustEngine', () => {
  it('returns default snapshot when no events recorded', () => {
    const engine = new TrustEngine();
    const snapshot = engine.snapshot('a1', 't1');
    expect(snapshot.sampleSize).toBe(0);
    expect(snapshot.overallScore).toBeGreaterThan(0);
    expect(snapshot.overallScore).toBeLessThan(1);
  });

  it('weighted-averages events per dimension', () => {
    const engine = new TrustEngine();
    for (let i = 0; i < 10; i++) {
      engine.record({ agentId: 'a1', tenantId: 't1', dimension: 'tool_success_rate', value: 1 });
    }
    const snapshot = engine.snapshot('a1', 't1');
    expect(snapshot.dimensions.tool_success_rate).toBeCloseTo(1, 5);
    expect(snapshot.sampleSize).toBe(10);
  });

  it('suggests degradation when overall trust drops below threshold', () => {
    const engine = new TrustEngine();
    for (let i = 0; i < 20; i++) {
      engine.record({ agentId: 'a1', tenantId: 't1', dimension: 'tool_success_rate', value: 0 });
      engine.record({ agentId: 'a1', tenantId: 't1', dimension: 'approval_pass_rate', value: 0 });
      engine.record({ agentId: 'a1', tenantId: 't1', dimension: 'guardrail_compliance', value: 0 });
    }
    const adjustment = engine.evaluateAdjustment('a1', 't1');
    expect(adjustment).not.toBeNull();
    expect(adjustment?.autonomyDelta).toBeLessThan(0);
    expect(adjustment?.reason).toContain('below degradation threshold');
  });

  it('returns null when sample size is too small', () => {
    const engine = new TrustEngine();
    engine.record({ agentId: 'a1', tenantId: 't1', dimension: 'tool_success_rate', value: 1 });
    expect(engine.evaluateAdjustment('a1', 't1')).toBeNull();
  });
});
