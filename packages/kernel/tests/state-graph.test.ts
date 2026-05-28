import { describe, expect, it } from 'vitest';
import { StateGraphEngine, type IGraphNode } from '../src/index.js';

interface TestState {
  readonly steps: readonly string[];
  readonly approved?: boolean;
}

describe('StateGraphEngine', () => {
  it('interrupts and resumes from a specific node', async () => {
    const graph = new StateGraphEngine<TestState>();
    const start: IGraphNode<TestState> = {
      id: 'start',
      execute: async (state) => ({ state: { ...state, steps: [...state.steps, 'start'] }, next: 'approval' }),
    };
    const approval: IGraphNode<TestState> = {
      id: 'approval',
      execute: async (state) => state.approved
        ? { state: { ...state, steps: [...state.steps, 'approval'] }, next: 'finish' }
        : { state, interrupted: true, interruptReason: 'approval', next: 'approval' },
    };
    const finish: IGraphNode<TestState> = {
      id: 'finish',
      execute: async (state) => ({ state: { ...state, steps: [...state.steps, 'finish'] } }),
    };
    graph.addNode(start);
    graph.addNode(approval);
    graph.addNode(finish);
    graph.addEdge({ from: 'start', to: 'approval' });
    graph.addEdge({ from: 'approval', to: 'finish' });

    const interrupted = await graph.execute('start', { steps: [] }, {
      runId: 'run',
      tenantId: 'tenant',
      idempotencyKey: 'key',
    });
    expect(interrupted.interrupted).toBe(true);
    expect(interrupted.next).toBe('approval');

    const resumed = await graph.resume('approval', { ...interrupted.state, approved: true }, {
      runId: 'run',
      tenantId: 'tenant',
      idempotencyKey: 'key-resume',
    });
    expect(resumed.state.steps).toEqual(['start', 'approval', 'finish']);
  });
});
