import { describe, it, expect } from 'vitest';
import type { AgentStreamEvent, ILLMProvider, LLMCallOptions, LLMMessage, LLMStreamChunk, ToolResult } from '@nexus/shared';
import { QueryLoop, type ToolExecutor } from '@nexus/kernel';
import type { LLMToolDef } from '@nexus/kernel';
import { ControlPlaneOrchestrator } from '@nexus/control-plane';
import { CheckpointManager } from '@nexus/kernel';

/**
 * E2E 测试套件 — Mock LLM 录制回放
 * 4 个核心场景验证端到端链路
 */

class MockLLMProvider implements ILLMProvider {
  private responses: LLMStreamChunk[][] = [];
  private callIndex = 0;

  addResponse(chunks: LLMStreamChunk[]): void {
    this.responses.push(chunks);
  }

  async *chat(_messages: readonly LLMMessage[], _options: LLMCallOptions): AsyncGenerator<LLMStreamChunk> {
    const response = this.responses[this.callIndex] ?? this.responses[this.responses.length - 1];
    this.callIndex++;
    if (!response) return;
    for (const chunk of response) {
      yield chunk;
    }
  }
}

class MockToolExecutor implements ToolExecutor {
  private handlers = new Map<string, (args: string) => ToolResult>();

  registerHandler(toolName: string, handler: (args: string) => ToolResult): void {
    this.handlers.set(toolName, handler);
  }

  async execute(toolName: string, args: string, _runId: string): Promise<ToolResult> {
    const handler = this.handlers.get(toolName);
    if (!handler) return { success: false, error: `Tool ${toolName} not found`, durationMs: 0 };
    return handler(args);
  }

  getToolDefs(): readonly LLMToolDef[] {
    return [...this.handlers.keys()].map((name) => ({
      name,
      description: `Mock tool ${name}`,
      inputSchema: { type: 'object' },
    }));
  }
}

function collectEvents(gen: AsyncGenerator<AgentStreamEvent>): Promise<AgentStreamEvent[]> {
  return (async () => {
    const events: AgentStreamEvent[] = [];
    for await (const e of gen) events.push(e);
    return events;
  })();
}

describe('E2E Scenario 1: Normal Completion', () => {
  it('should complete a task with tool call and final response', async () => {
    const provider = new MockLLMProvider();
    provider.addResponse([
      { type: 'text_delta', delta: 'Let me query the project.' },
      { type: 'tool_call_start', id: 'tc1', name: 'project.query' },
      { type: 'tool_call_delta', id: 'tc1', argumentsDelta: '{"projectId":"p1"}' },
      { type: 'tool_call_end', id: 'tc1' },
      { type: 'done', usage: { input: 100, output: 50 } },
    ]);
    provider.addResponse([
      { type: 'text_delta', delta: 'The project has 5 tasks, 2 completed.' },
      { type: 'done', usage: { input: 200, output: 80 } },
    ]);

    const tools = new MockToolExecutor();
    tools.registerHandler('project.query', () => ({
      success: true,
      data: { id: 'p1', name: 'Demo', tasks: 5, completed: 2 },
      durationMs: 10,
    }));

    const loop = new QueryLoop({
      provider,
      toolExecutor: tools,
      config: {
        maxTurns: 10,
        maxToolCallsPerTurn: 5,
        budgetSnapshot: { tokenBudget: { total: 10000, used: 0, remaining: 10000 }, costBudget: { total: 1, used: 0, remaining: 1 }, timeBudget: { total: 60000, used: 0, remaining: 60000 }, stepBudget: { total: 20, used: 0, remaining: 20 } },
        abortSignal: new AbortController().signal,
      },
    });

    const events = await collectEvents(loop.run([{ role: 'user', content: 'Show project status' }], 'mock'));

    expect(events.some((e) => e.type === 'tool_use_result')).toBe(true);
    expect(events.some((e) => e.type === 'completed')).toBe(true);
    const completed = events.find((e) => e.type === 'completed') as { type: 'completed'; result: { success: boolean; turnsExecuted: number; toolCallsCount: number } };
    expect(completed.result.success).toBe(true);
    expect(completed.result.turnsExecuted).toBe(2);
    expect(completed.result.toolCallsCount).toBe(1);
  });
});

describe('E2E Scenario 2: Budget Exhaustion', () => {
  it('should terminate when budget runs out', async () => {
    const provider = new MockLLMProvider();
    for (let i = 0; i < 5; i++) {
      provider.addResponse([
        { type: 'tool_call_start', id: `tc${i}`, name: 'task.query' },
        { type: 'tool_call_delta', id: `tc${i}`, argumentsDelta: '{}' },
        { type: 'tool_call_end', id: `tc${i}` },
        { type: 'done', usage: { input: 500, output: 200 } },
      ]);
    }

    const tools = new MockToolExecutor();
    tools.registerHandler('task.query', () => ({ success: true, data: [], durationMs: 5 }));

    const loop = new QueryLoop({
      provider,
      toolExecutor: tools,
      config: {
        maxTurns: 20,
        maxToolCallsPerTurn: 5,
        budgetSnapshot: { tokenBudget: { total: 1000, used: 0, remaining: 1000 }, costBudget: { total: 1, used: 0, remaining: 1 }, timeBudget: { total: 60000, used: 0, remaining: 60000 }, stepBudget: { total: 20, used: 0, remaining: 20 } },
        abortSignal: new AbortController().signal,
      },
    });

    const events = await collectEvents(loop.run([{ role: 'user', content: 'Keep querying' }], 'mock'));

    const completed = events.find((e) => e.type === 'completed') as { type: 'completed'; result: { success: boolean } };
    expect(completed).toBeDefined();
    expect(completed.result.success).toBe(false);
  });
});

describe('E2E Scenario 3: Tool Failure Self-Healing', () => {
  it('should feed back error to model and recover', async () => {
    const provider = new MockLLMProvider();
    provider.addResponse([
      { type: 'tool_call_start', id: 'tc1', name: 'broken.tool' },
      { type: 'tool_call_delta', id: 'tc1', argumentsDelta: '{}' },
      { type: 'tool_call_end', id: 'tc1' },
      { type: 'done', usage: { input: 100, output: 50 } },
    ]);
    provider.addResponse([
      { type: 'text_delta', delta: 'The tool failed, using alternative approach.' },
      { type: 'done', usage: { input: 200, output: 80 } },
    ]);

    const tools = new MockToolExecutor();
    tools.registerHandler('broken.tool', () => ({
      success: false,
      error: 'Permission denied: insufficient access',
      durationMs: 5,
    }));

    const loop = new QueryLoop({
      provider,
      toolExecutor: tools,
      config: {
        maxTurns: 10,
        maxToolCallsPerTurn: 5,
        budgetSnapshot: { tokenBudget: { total: 10000, used: 0, remaining: 10000 }, costBudget: { total: 1, used: 0, remaining: 1 }, timeBudget: { total: 60000, used: 0, remaining: 60000 }, stepBudget: { total: 20, used: 0, remaining: 20 } },
        abortSignal: new AbortController().signal,
      },
    });

    const events = await collectEvents(loop.run([{ role: 'user', content: 'Try the tool' }], 'mock'));

    expect(events.some((e) => e.type === 'tool_use_error')).toBe(true);
    expect(events.some((e) => e.type === 'self_heal')).toBe(true);
    const completed = events.find((e) => e.type === 'completed') as { type: 'completed'; result: { success: boolean } };
    expect(completed.result.success).toBe(true);
  });
});

describe('E2E Scenario 4: Control Plane Orchestration', () => {
  it('should create run and process events through orchestrator', async () => {
    const orchestrator = new ControlPlaneOrchestrator();
    const run = orchestrator.createRun({
      agentId: 'requirement-analyst',
      tenantId: 'tenant-1',
      userId: 'user-1',
      correlationId: 'corr-1',
    });

    expect(orchestrator.runManager.get(run.id)?.status).toBe('running');

    const toolEvent: AgentStreamEvent = {
      type: 'tool_use_result',
      toolName: 'project.query',
      toolCallId: 'tc1',
      result: { id: 'p1' },
      durationMs: 10,
      runId: run.id,
    };

    const result = orchestrator.processEvent(toolEvent, run.id, 'tenant-1', 'requirement-analyst');
    expect(result.shouldPause).toBe(false);
    expect(orchestrator.auditEngine.getByRun(run.id).length).toBeGreaterThan(0);

    const completedEvent: AgentStreamEvent = {
      type: 'completed',
      result: { success: true, tokensUsed: 500, turnsExecuted: 2, toolCallsCount: 1 },
      runId: run.id,
    };

    orchestrator.processEvent(completedEvent, run.id, 'tenant-1', 'requirement-analyst');
    expect(orchestrator.runManager.get(run.id)?.status).toBe('succeeded');
  });

  it('should handle approval flow through orchestrator', async () => {
    const orchestrator = new ControlPlaneOrchestrator();
    const run = orchestrator.createRun({
      agentId: 'task-planner',
      tenantId: 'tenant-1',
      userId: 'user-1',
      correlationId: 'corr-2',
    });

    const approvalEvent: AgentStreamEvent = {
      type: 'approval_required',
      requestId: 'req-1',
      toolName: 'task.assign',
      reason: 'R2 tool requires approval',
      runId: run.id,
    };

    const result = orchestrator.processEvent(approvalEvent, run.id, 'tenant-1', 'task-planner');
    expect(result.shouldPause).toBe(true);
    expect(result.approvalRequestId).toBeDefined();
    expect(orchestrator.runManager.get(run.id)?.status).toBe('waiting_approval');

    orchestrator.approvalEngine.approve(result.approvalRequestId!, 'admin');
    expect(orchestrator.runManager.get(run.id)?.status).toBe('running');
  });
});

describe('E2E Scenario 5: Checkpoint Recovery', () => {
  it('should save and load latest checkpoint for resume', async () => {
    const checkpoint = new CheckpointManager({ periodicInterval: 1 });
    const snapshots: any[] = [];
    checkpoint.setStore({
      async save(snapshot) {
        snapshots.push(snapshot);
        return `cp-${snapshots.length}`;
      },
      async load(runId) {
        return snapshots.find((snapshot) => snapshot.runId === runId) ?? null;
      },
      async loadLatest(runId) {
        return snapshots.filter((snapshot) => snapshot.runId === runId).at(-1) ?? null;
      },
    });

    const saved = await checkpoint.save({
      runId: 'run-recover',
      messages: [{ role: 'user', content: 'recover me' }],
      budget: {
        tokenBudget: { total: 1000, used: 100, remaining: 900 },
        costBudget: { total: 1, used: 0, remaining: 1 },
        timeBudget: { total: 1000, used: 0, remaining: 1000 },
        stepBudget: { total: 10, used: 1, remaining: 9 },
      },
      turnCount: 1,
      createdAt: new Date(),
      reason: 'post_tool_execution',
    });

    expect(saved).toBe('cp-1');
    const latest = await checkpoint.loadLatest('run-recover');
    expect(latest?.turnCount).toBe(1);
  });
});

describe('E2E Scenario 6: Approval Timeout', () => {
  it('should transition waiting approval to handed_over when timed out', async () => {
    const orchestrator = new ControlPlaneOrchestrator();
    const run = orchestrator.createRun({
      agentId: 'task-planner',
      tenantId: 'tenant-1',
      userId: 'user-1',
      correlationId: 'corr-timeout',
    });

    const result = orchestrator.processEvent({
      type: 'approval_required',
      requestId: 'req-timeout',
      toolName: 'task.assign',
      reason: 'requires approval',
      runId: run.id,
    }, run.id, 'tenant-1', 'task-planner');

    const request = orchestrator.approvalEngine.getRequest(result.approvalRequestId!);
    expect(request).toBeDefined();
    Object.defineProperty(request!, 'deadline', { value: new Date(Date.now() - 1) });
    orchestrator.approvalEngine.checkAllTimeouts();

    expect(orchestrator.runManager.get(run.id)?.status).toBe('handed_over');
  });
});

describe('E2E Scenario 7: Budget Waiting State', () => {
  it('should move running run to waiting_budget when token usage exhausts budget', async () => {
    const orchestrator = new ControlPlaneOrchestrator({
      tokenLimit: 10,
      costLimitUsd: 1,
      timeLimitMs: 60000,
      stepLimit: 10,
    });
    const run = orchestrator.createRun({
      agentId: 'requirement-analyst',
      tenantId: 'tenant-1',
      userId: 'user-1',
      correlationId: 'corr-budget',
    });

    orchestrator.recordTokenUsage(run.id, 10, 1);
    expect(orchestrator.runManager.get(run.id)?.status).toBe('waiting_budget');
  });
});
