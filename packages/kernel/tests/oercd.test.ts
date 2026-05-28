import { describe, expect, it } from 'vitest';
import { NoopCrystallizePhase, NoopDistributePhase, OERCDEngine, type ExecutionTrace } from '../src/index.js';

describe('OERCD MVP', () => {
  const ctx = {
    runId: 'run-oercd',
    agentId: 'agent',
    tenantId: 'tenant',
    taskDescription: 'task',
    toolCallCount: 5,
  };

  it('observes, records trace and reflects after threshold', async () => {
    const engine = new OERCDEngine();
    const observed = await engine.observe(ctx);
    expect(observed.confidence).toBe(0);

    const trace: ExecutionTrace = {
      runId: ctx.runId,
      totalDurationMs: 10,
      tokensUsed: 100,
      steps: [
        { turnIndex: 1, action: 'tool', toolName: 'project.query', durationMs: 5, success: true },
        { turnIndex: 2, action: 'answer', durationMs: 5, success: true },
      ],
    };
    await engine.recordTrace(ctx, trace);
    const reflection = await engine.reflect(ctx);

    expect(reflection?.efficiencyScore).toBe(1);
    expect(reflection?.shouldCrystallize).toBe(true);
  });

  it('keeps crystallize and distribute injectable as noops', async () => {
    const crystallize = new NoopCrystallizePhase();
    const distribute = new NoopDistributePhase();
    const skill = await crystallize.crystallize(ctx, {
      efficiencyScore: 1,
      optimalPath: ['tool'],
      improvements: [],
      shouldCrystallize: true,
    });

    expect(skill.status).toBe('pending_review');
    const result = await distribute.distribute(skill, 'self');
    expect(result.requiresReview).toBe(true);
  });
});
