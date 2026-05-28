import { describe, expect, it } from 'vitest';
import { GatewayToolExecutor, ToolGatewayPipeline, registerDelegateTool } from '../src/index.js';

describe('ai.agent.invoke (delegate tool)', () => {
  it('forwards calls to injected invokeAgent callback and returns aggregated child result', async () => {
    const pipeline = new ToolGatewayPipeline();
    const calls: Array<{ agentId: string; input: string; reason: string }> = [];
    registerDelegateTool(pipeline, {
      invokableAgents: ['task-planner', 'estimation'],
      invokeAgent: async ({ agentId, input, reason }) => {
        calls.push({ agentId, input, reason });
        return {
          childRunId: `child-${agentId}`,
          success: true,
          outputText: `done:${agentId}:${input}`,
          events: 3,
        };
      },
    });
    const executor = new GatewayToolExecutor(pipeline, { approvalPolicy: 'auto', maxRiskLevel: 'R2' });

    const result = await executor.execute(
      'ai.agent.invoke',
      JSON.stringify({ agentId: 'task-planner', input: '拆解需求 X', reason: '需要 WBS 专家' }),
      'parent-run-1',
    );
    expect(result.success).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.agentId).toBe('task-planner');
    expect(JSON.stringify(result.data)).toContain('done:task-planner');
    expect(JSON.stringify(result.data)).toContain('child-task-planner');
  });

  it('rejects when target agent is outside the invokable allowlist', async () => {
    const pipeline = new ToolGatewayPipeline();
    registerDelegateTool(pipeline, {
      invokableAgents: ['task-planner'],
      invokeAgent: async () => ({ childRunId: 'x', success: true, events: 0 }),
    });
    const executor = new GatewayToolExecutor(pipeline, { approvalPolicy: 'auto', maxRiskLevel: 'R2' });

    const result = await executor.execute(
      'ai.agent.invoke',
      JSON.stringify({ agentId: 'project-doctor', input: 'check health' }),
      'parent-run-2',
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('not in the invokable allowlist');
  });

  it('propagates child failure as tool failure', async () => {
    const pipeline = new ToolGatewayPipeline();
    registerDelegateTool(pipeline, {
      invokeAgent: async () => ({ childRunId: 'c1', success: false, error: 'child_run_failed', events: 1 }),
    });
    const executor = new GatewayToolExecutor(pipeline, { approvalPolicy: 'auto', maxRiskLevel: 'R2' });

    const result = await executor.execute(
      'ai.agent.invoke',
      JSON.stringify({ agentId: 'whatever', input: 'x' }),
      'parent-run-3',
    );
    expect(result.success).toBe(false);
    expect(result.error).toBe('child_run_failed');
  });
});
