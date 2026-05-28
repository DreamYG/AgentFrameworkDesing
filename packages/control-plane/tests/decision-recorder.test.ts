import { describe, expect, it } from 'vitest';
import { DecisionRecorder, type DecisionRecord } from '../src/decision-recorder/index.js';

describe('DecisionRecorder', () => {
  it('records and lists decisions per run', () => {
    const recorder = new DecisionRecorder();
    recorder.record({
      runId: 'run-1',
      tenantId: 't1',
      agentId: 'general-assistant',
      turnCount: 1,
      decisionType: 'tool_selection',
      input: { candidates: ['a', 'b'] },
      reasoning: 'a is more relevant',
      confidence: 0.8,
      output: { selected: 'a' },
    });
    recorder.record({
      runId: 'run-2',
      tenantId: 't1',
      agentId: 'task-planner',
      turnCount: 1,
      decisionType: 'plan_step',
      input: {},
      output: { step: 'decompose' },
    });
    expect(recorder.listByRun('run-1')).toHaveLength(1);
    expect(recorder.listByRun('run-2')).toHaveLength(1);
    expect(recorder.listByRun('run-1')[0]?.confidence).toBe(0.8);
  });

  it('forwards to persister when provided', async () => {
    const saved: DecisionRecord[] = [];
    const recorder = new DecisionRecorder({
      async save(record) { saved.push(record); },
      async listByRun() { return []; },
    });
    recorder.record({
      runId: 'r',
      tenantId: 't',
      agentId: 'a',
      turnCount: 0,
      decisionType: 'risk_assessment',
      input: {},
      output: {},
    });
    // 等异步 persist 落地
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(saved).toHaveLength(1);
  });

  it('aggregates counts by type for cognitive heatmap', () => {
    const recorder = new DecisionRecorder();
    recorder.record({ runId: 'r', tenantId: 't', agentId: 'a', turnCount: 1, decisionType: 'tool_selection', input: {}, output: {} });
    recorder.record({ runId: 'r', tenantId: 't', agentId: 'a', turnCount: 2, decisionType: 'tool_selection', input: {}, output: {} });
    recorder.record({ runId: 'r', tenantId: 't', agentId: 'a', turnCount: 3, decisionType: 'compact_strategy', input: {}, output: {} });
    const counts = recorder.countByType('r');
    expect(counts.tool_selection).toBe(2);
    expect(counts.compact_strategy).toBe(1);
    expect(counts.risk_assessment).toBe(0);
  });
});
