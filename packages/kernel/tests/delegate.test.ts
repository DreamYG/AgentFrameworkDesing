import { describe, expect, it } from 'vitest';
import type { AgentStreamEvent } from '@nexus/shared';
import { DelegateEngine, type IChildRunStarter } from '../src/index.js';

describe('DelegateEngine', () => {
  it('falls back to placeholder when no starter is injected', async () => {
    const delegate = new DelegateEngine();
    const result = await delegate.delegate({
      parentRunId: 'parent',
      childAgentId: 'child',
      input: { task: 'subtask' },
      permissions: { allowedTools: ['project.query'], maxRiskLevel: 'R0', budgetRemaining: 100, approvalPolicy: 'auto' },
      budgetShare: 0.25,
      reason: 'split task',
    });
    expect(result.success).toBe(true);
    expect(delegate.getActiveChildren('parent')).toContain(result.childRunId);
    await delegate.cancel(result.childRunId, 'done');
    expect(delegate.getActiveChildren('parent')).not.toContain(result.childRunId);
  });

  it('starts a real child run via the injected starter and aggregates output text', async () => {
    const starter = createMockStarter([
      { type: 'text_delta', delta: 'hello-' },
      { type: 'text_delta', delta: 'child' },
      {
        type: 'completed',
        result: { success: true, output: 'ok', tokensUsed: 0, turnsExecuted: 1, toolCallsCount: 0 },
      },
    ]);
    const delegate = new DelegateEngine({ starter });
    const result = await delegate.delegate({
      parentRunId: 'parent-1',
      childAgentId: 'task-planner',
      input: 'plan it',
      permissions: { allowedTools: [], maxRiskLevel: 'R2', budgetRemaining: 100, approvalPolicy: 'auto' },
      budgetShare: 0.5,
      reason: 'subtask',
    });
    expect(result.success).toBe(true);
    expect(result.outputText).toBe('hello-child');
    expect(result.summary).toBe('hello-child');
    expect(result.events.length).toBe(3);
  });

  it('rejects when delegation depth exceeds maxDepth', async () => {
    const delegate = new DelegateEngine({ starter: createMockStarter([]), maxDepth: 2 });
    const result = await delegate.delegate({
      parentRunId: 'p',
      childAgentId: 'c',
      input: 'x',
      permissions: { allowedTools: [], maxRiskLevel: 'R0', budgetRemaining: 0, approvalPolicy: 'auto' },
      budgetShare: 0,
      reason: 'deep',
      depth: 2,
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('delegation_depth_exceeded');
  });

  it('propagates child run failure as success=false', async () => {
    const starter = createMockStarter([
      {
        type: 'completed',
        result: { success: false, output: '', tokensUsed: 0, turnsExecuted: 0, toolCallsCount: 0 },
      },
    ]);
    const delegate = new DelegateEngine({ starter });
    const result = await delegate.delegate({
      parentRunId: 'p',
      childAgentId: 'c',
      input: 'x',
      permissions: { allowedTools: [], maxRiskLevel: 'R0', budgetRemaining: 0, approvalPolicy: 'auto' },
      budgetShare: 0,
      reason: 'fail-case',
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe('child_run_failed');
  });
});

function createMockStarter(events: readonly AgentStreamEvent[]): IChildRunStarter {
  return {
    async start() {
      return {
        childRunId: `child-${Math.random().toString(36).slice(2, 8)}`,
        events: (async function* () {
          for (const event of events) yield event;
        })(),
        cancel: async () => undefined,
      };
    },
  };
}
