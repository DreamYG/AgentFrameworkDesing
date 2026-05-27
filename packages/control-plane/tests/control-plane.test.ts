import { describe, it, expect } from 'vitest';
import { AgentRegistry } from '../src/agent-registry/index.js';
import { RunManager } from '../src/run-manager/index.js';
import { ApprovalEngine } from '../src/approval-engine/index.js';
import { PolicyEngine } from '../src/policy-engine/index.js';
import { BudgetManager } from '../src/budget-manager/index.js';
import { AuditEngine } from '../src/audit-engine/index.js';
import { Scheduler } from '../src/scheduler/index.js';
import { IntentRouter } from '../src/intent-router/index.js';
import { RetryPolicy } from '../src/retry-policy/index.js';
import { ModelRouter } from '../src/model-router/index.js';
import { DefaultContextPolicy } from '../src/context-policy/index.js';
import type { AgentDefinition } from '../src/agent-registry/index.js';

const mockAgent: AgentDefinition = {
  id: 'agent-1',
  name: 'TestAgent',
  description: 'A test agent',
  version: '1.0.0',
  phase: 'intent',
  modelPreference: 'claude-sonnet',
  allowedTools: ['project.query', 'task.create'],
  maxRiskLevel: 'R2',
  promptTemplate: {
    id: 'pt-1',
    version: 1,
    identity: 'You are TestAgent',
    safetyConstraints: 'Be safe',
    skillIndex: '',
    toolSignatures: '',
  },
  enabled: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('AgentRegistry', () => {
  it('should register and retrieve agents', () => {
    const registry = new AgentRegistry();
    registry.register(mockAgent);

    expect(registry.get('agent-1')).toBeDefined();
    expect(registry.getByPhase('intent')).toHaveLength(1);
    expect(registry.findByCapability('project.query')).toHaveLength(1);
    expect(registry.findByCapability('unknown.tool')).toHaveLength(0);
  });
});

describe('RunManager', () => {
  it('should manage full lifecycle: created → running → succeeded', () => {
    const rm = new RunManager();
    const run = rm.create({
      agentId: 'agent-1',
      tenantId: 'tenant-1',
      userId: 'user-1',
      correlationId: 'corr-1',
    });

    expect(run.status).toBe('created');
    rm.transition(run.id, { type: 'dispatch' });
    expect(rm.get(run.id)!.status).toBe('running');
    rm.transition(run.id, { type: 'complete' });
    expect(rm.get(run.id)!.status).toBe('succeeded');
  });

  it('should handle approval flow: running → waiting_approval → running', () => {
    const rm = new RunManager();
    const run = rm.create({ agentId: 'a', tenantId: 't', userId: 'u', correlationId: 'c' });
    rm.transition(run.id, { type: 'dispatch' });
    rm.transition(run.id, { type: 'require_approval', requestId: 'req-1' });
    expect(rm.get(run.id)!.status).toBe('waiting_approval');
    rm.transition(run.id, { type: 'approval_granted' });
    expect(rm.get(run.id)!.status).toBe('running');
  });

  it('should handle budget exhaustion: running → waiting_budget → resuming → running', () => {
    const rm = new RunManager();
    const run = rm.create({ agentId: 'a', tenantId: 't', userId: 'u', correlationId: 'c' });
    rm.transition(run.id, { type: 'dispatch' });
    rm.transition(run.id, { type: 'budget_exhausted' });
    expect(rm.get(run.id)!.status).toBe('waiting_budget');
    rm.transition(run.id, { type: 'budget_refilled' });
    expect(rm.get(run.id)!.status).toBe('resuming');
    rm.transition(run.id, { type: 'recovery_loaded' });
    expect(rm.get(run.id)!.status).toBe('running');
  });
});

describe('ApprovalEngine', () => {
  it('should require approval for R2+ tools', () => {
    const engine = new ApprovalEngine();
    expect(engine.shouldRequireApproval('R0', 'standard')).toBe(false);
    expect(engine.shouldRequireApproval('R1', 'standard')).toBe(false);
    expect(engine.shouldRequireApproval('R2', 'standard')).toBe(true);
    expect(engine.shouldRequireApproval('R3', 'standard')).toBe(true);
    expect(engine.shouldRequireApproval('RX', 'standard')).toBe(true);
  });

  it('should create and approve requests', () => {
    const engine = new ApprovalEngine();
    let approved = false;
    engine.onApproval(() => { approved = true; });

    const request = engine.createRequest({
      runId: 'run-1',
      tenantId: 'tenant-1',
      toolName: 'task.assign',
      toolParams: { assignee: 'user-2' },
      riskLevel: 'R2',
      reason: 'Assigning task',
      approvers: ['manager-1'],
      timeoutMs: 60000,
    });

    expect(request.status).toBe('pending');
    engine.approve(request.id, 'manager-1');
    expect(engine.getRequest(request.id)!.status).toBe('approved');
    expect(approved).toBe(true);
  });
});

describe('PolicyEngine', () => {
  it('should deny tools not in agent allowlist', () => {
    const policy = new PolicyEngine();
    policy.registerAgentTools('agent-1', ['project.query']);

    const decision = policy.evaluate({
      userId: 'user-1',
      agentId: 'agent-1',
      tenantId: 'tenant-1',
      toolName: 'dangerous.tool',
      toolRiskLevel: 'R0',
    });
    expect(decision).toBe('deny');
  });

  it('should deny unregistered agent tools by default', () => {
    const policy = new PolicyEngine();
    const decision = policy.evaluate({
      userId: 'user-1',
      agentId: 'agent-2',
      tenantId: 'tenant-1',
      toolName: 'task.assign',
      toolRiskLevel: 'R2',
    });
    expect(decision).toBe('deny');
  });
});

describe('BudgetManager', () => {
  it('should track exhaustion across dimensions', () => {
    const budget = new BudgetManager({
      tokenLimit: 1000,
      costLimitUsd: 0.1,
      timeLimitMs: 60000,
      stepLimit: 10,
    });

    budget.recordTokens(400, 100);
    expect(budget.isExhausted()).toBe(false);

    budget.recordTokens(300, 200);
    expect(budget.isExhausted()).toBe(true);
  });

  it('should recommend model downgrade based on usage', () => {
    const budget = new BudgetManager({
      tokenLimit: 10000,
      costLimitUsd: 1.0,
      timeLimitMs: 300000,
      stepLimit: 50,
    });

    expect(budget.getDowngradeAction()).toBe('none');
    budget.recordTokens(3000, 3500);
    expect(budget.getDowngradeAction()).toBe('use_lighter_model');
    budget.recordTokens(2000, 1000);
    expect(budget.getDowngradeAction()).toBe('stop');
  });
});

describe('AuditEngine', () => {
  it('should record and retrieve audit entries by run', () => {
    const audit = new AuditEngine();
    audit.record({
      tenantId: 'tenant-1',
      runId: 'run-1',
      agentId: 'agent-1',
      eventType: 'tool.called',
      data: { toolName: 'project.query' },
    });
    audit.record({
      tenantId: 'tenant-1',
      runId: 'run-1',
      agentId: 'agent-1',
      eventType: 'run.status_changed',
      data: { from: 'created', to: 'running' },
    });

    expect(audit.getByRun('run-1')).toHaveLength(2);
    expect(audit.count()).toBe(2);
  });
});

describe('Scheduler', () => {
  it('should enforce tenant concurrent limits', () => {
    const scheduler = new Scheduler({
      strategy: 'fifo',
      maxConcurrentPerTenant: 2,
      maxGlobalConcurrent: 10,
    });

    scheduler.enqueue({ id: '1', runId: 'r1', tenantId: 't1', priority: 'P2', createdAt: new Date() });
    scheduler.enqueue({ id: '2', runId: 'r2', tenantId: 't1', priority: 'P2', createdAt: new Date() });
    scheduler.enqueue({ id: '3', runId: 'r3', tenantId: 't1', priority: 'P2', createdAt: new Date() });

    expect(scheduler.dequeue()).toBeDefined();
    expect(scheduler.dequeue()).toBeDefined();
    expect(scheduler.dequeue()).toBeNull(); // tenant limit reached

    scheduler.complete('r1', 't1');
    expect(scheduler.dequeue()).toBeDefined(); // now one slot freed
  });
});

describe('IntentRouter', () => {
  it('should route to correct phase by keywords', () => {
    const router = new IntentRouter({ fallbackAgentId: 'fallback', confidenceThreshold: 0.5 });
    router.registerAgents([mockAgent]);

    const intent = router.route('帮我把任务拆解一下');
    expect(intent.phase).toBe('intent');

    const execIntent = router.route('帮我实现这个代码');
    expect(execIntent.phase).toBe('execution');
  });
});

describe('RetryPolicy', () => {
  it('should escalate on permission denied', () => {
    const policy = new RetryPolicy();
    const decision = policy.shouldRetry({ type: 'permission_denied', message: 'denied' }, 0);
    expect(decision.action).toBe('escalate');
  });

  it('should retry with backoff on timeout', () => {
    const policy = new RetryPolicy();
    const d1 = policy.shouldRetry({ type: 'timeout', message: 'timed out' }, 0);
    expect(d1.action).toBe('retry');
    if (d1.action === 'retry') expect(d1.delayMs).toBe(1000);

    const d2 = policy.shouldRetry({ type: 'timeout', message: 'timed out' }, 1);
    if (d2.action === 'retry') expect(d2.delayMs).toBe(2000);
  });
});

describe('ModelRouter', () => {
  it('should select model based on task and budget', () => {
    const router = new ModelRouter();
    router.registerModel({ id: 'opus', tier: 'premium', costPerInputToken: 0.00003, costPerOutputToken: 0.00015, maxContextWindow: 200000, latencyMs: 10000 });
    router.registerModel({ id: 'sonnet', tier: 'standard', costPerInputToken: 0.000006, costPerOutputToken: 0.00003, maxContextWindow: 200000, latencyMs: 3000 });
    router.registerModel({ id: 'haiku', tier: 'lightweight', costPerInputToken: 0.0000005, costPerOutputToken: 0.0000025, maxContextWindow: 200000, latencyMs: 1000 });

    const decision = router.route({
      taskType: 'reasoning',
      remainingBudget: {
        snapshot: {
          tokenBudget: { total: 10000, used: 0, remaining: 10000 },
          costBudget: { total: 1, used: 0, remaining: 1 },
          timeBudget: { total: 60000, used: 0, remaining: 60000 },
          stepBudget: { total: 20, used: 0, remaining: 20 },
        },
        isExhausted: false,
        warningDimensions: [],
      },
      latencyRequirement: 'interactive',
      qualityRequirement: 'best',
      contextSize: 5000,
    });

    expect(decision.modelId).toBe('opus');
  });
});

describe('DefaultContextPolicy', () => {
  it('should use full_context when under 50%', () => {
    const policy = new DefaultContextPolicy();
    const decision = policy.decide({
      currentTokenCount: 3000,
      maxContextWindow: 100000,
      hasSessionSummary: false,
      hasCheckpoint: false,
      turnCount: 3,
    });
    expect(decision.strategy).toBe('full_context');
  });

  it('should use sliding_window at 50-80%', () => {
    const policy = new DefaultContextPolicy();
    const decision = policy.decide({
      currentTokenCount: 60000,
      maxContextWindow: 100000,
      hasSessionSummary: false,
      hasCheckpoint: false,
      turnCount: 20,
    });
    expect(decision.strategy).toBe('sliding_window');
  });

  it('should use summary_prefix when available and >80%', () => {
    const policy = new DefaultContextPolicy();
    const decision = policy.decide({
      currentTokenCount: 85000,
      maxContextWindow: 100000,
      hasSessionSummary: true,
      hasCheckpoint: false,
      turnCount: 30,
    });
    expect(decision.strategy).toBe('summary_prefix');
  });
});
