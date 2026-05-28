import type {
  AgentRunResult,
  AgentStreamEvent,
  AgentContext,
  HealthStatus,
  IAgentRuntime,
  LLMMessage,
  PermissionContext,
  PhaseId,
  ResumeSignal,
  RuntimeInput,
} from '@nexus/shared';
import type { ToolDefinition } from '@nexus/shared';
import type { ILLMProvider, QueryLoopConfig } from './types.js';
import { QueryLoop } from './query-loop.js';
import type { CompactRuntimeOptions, ToolExecutor } from './query-loop.js';
import type { HookRegistry } from '../lifecycle/hook-registry.js';
import type { GracefulShutdownController } from '../lifecycle/graceful-shutdown.js';
import { CheckpointManager } from '../checkpoint/checkpoint-manager.js';
import { InMemoryCheckpointStore } from '../checkpoint/in-memory-store.js';

/**
 * AgentRuntimeImpl — IAgentRuntime 具体实现
 * 编排 RunManager、QueryLoop、Hooks、Checkpoint 的完整生命周期
 * @stability S1
 */
export class AgentRuntimeImpl implements IAgentRuntime<RuntimeInput<string>, AgentRunResult> {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly version: string;
  readonly phase: PhaseId;

  private activeLoops = new Map<string, AbortController>();
  private readonly checkpointManager: CheckpointManager | undefined;

  constructor(
    private readonly config: {
      id: string;
      name: string;
      description: string;
      version: string;
      phase: PhaseId;
      provider: ILLMProvider;
      fallbackProvider?: ILLMProvider;
      toolExecutor: ToolExecutor;
      hookRegistry?: HookRegistry;
      checkpointManager?: CheckpointManager;
      shutdownController?: GracefulShutdownController;
      sessionSummaryProvider?: (runId: string) => Promise<string | null>;
      systemPrompt?: string;
      systemPromptResolver?: (input: RuntimeInput<string>, context: AgentContext) => string;
      model: string;
      modelResolver?: (input: RuntimeInput<string>, context: AgentContext) => string;
      maxTurns?: number;
      tokenBudget?: number;
      compactOptions?: CompactRuntimeOptions;
    },
  ) {
    this.id = config.id;
    this.name = config.name;
    this.description = config.description;
    this.version = config.version;
    this.phase = config.phase;
    this.checkpointManager = config.checkpointManager ?? new CheckpointManager({ periodicInterval: 1 });
    if (!config.checkpointManager) {
      this.checkpointManager.setStore(new InMemoryCheckpointStore());
    }
  }

  /**
   * 启动新的 AgentRun
   */
  async *start(input: RuntimeInput<string>, context: AgentContext): AsyncGenerator<AgentStreamEvent> {
    const controller = new AbortController();
    if (context.abortSignal.aborted) {
      controller.abort();
    } else {
      context.abortSignal.addEventListener('abort', () => controller.abort(), { once: true });
    }
    this.activeLoops.set(context.runId, controller);
    this.config.shutdownController?.registerActiveRun(context.runId, controller);

    const loopConfig: QueryLoopConfig = {
      maxTurns: this.config.maxTurns ?? 20,
      maxToolCallsPerTurn: 10,
      budgetSnapshot: {
        tokenBudget: { total: this.config.tokenBudget ?? 100000, used: 0, remaining: this.config.tokenBudget ?? 100000 },
        costBudget: { total: 1, used: 0, remaining: 1 },
        timeBudget: { total: 300000, used: 0, remaining: 300000 },
        stepBudget: { total: 50, used: 0, remaining: 50 },
      },
      abortSignal: controller.signal,
    };

    const loop = new QueryLoop({
      provider: this.config.provider,
      fallbackProvider: this.config.fallbackProvider,
      toolExecutor: this.config.toolExecutor,
      hookRegistry: this.config.hookRegistry,
      checkpointManager: this.checkpointManager,
      sessionSummaryProvider: this.config.sessionSummaryProvider,
      config: loopConfig,
      tenantId: context.tenantId,
      agentId: this.config.id,
      compactOptions: this.config.compactOptions,
    });

    const resolvedSystemPrompt = this.config.systemPromptResolver?.(input, context) ?? this.config.systemPrompt;
    const resolvedModel = this.config.modelResolver?.(input, context) ?? this.config.model;
    const messages: LLMMessage[] = [
      ...(resolvedSystemPrompt ? [{ role: 'system' as const, content: resolvedSystemPrompt }] : []),
      { role: 'user', content: input.content },
    ];

    try {
      for await (const event of loop.run(messages, resolvedModel, context.runId)) {
        yield event;
      }
    } finally {
      this.activeLoops.delete(context.runId);
      this.config.shutdownController?.deregisterRun(context.runId);
    }
  }

  /**
   * 从 Checkpoint 恢复执行
   */
  async *resume(runId: string, _signal: ResumeSignal): AsyncGenerator<AgentStreamEvent> {
    const checkpoint = await this.checkpointManager?.loadLatest(runId);
    if (!checkpoint) {
      yield { type: 'error', code: 'CHECKPOINT.NOT_FOUND', message: `No checkpoint for run ${runId}`, recoverable: false, runId };
      return;
    }

    const controller = new AbortController();
    this.activeLoops.set(runId, controller);
    this.config.shutdownController?.registerActiveRun(runId, controller);

    const loopConfig: QueryLoopConfig = {
      maxTurns: this.config.maxTurns ?? 20,
      maxToolCallsPerTurn: 10,
      budgetSnapshot: checkpoint.budget,
      abortSignal: controller.signal,
    };

    const loop = new QueryLoop({
      provider: this.config.provider,
      fallbackProvider: this.config.fallbackProvider,
      toolExecutor: this.config.toolExecutor,
      hookRegistry: this.config.hookRegistry,
      checkpointManager: this.checkpointManager,
      sessionSummaryProvider: this.config.sessionSummaryProvider,
      config: loopConfig,
      agentId: this.config.id,
      compactOptions: this.config.compactOptions,
    });

    const messages = checkpoint.messages as LLMMessage[];

    try {
      for await (const event of loop.run(messages, this.config.model, runId)) {
        yield event;
      }
    } finally {
      this.activeLoops.delete(runId);
      this.config.shutdownController?.deregisterRun(runId);
    }
  }

  /**
   * 取消执行中的 AgentRun
   */
  async cancel(runId: string, _reason: string): Promise<void> {
    const controller = this.activeLoops.get(runId);
    if (controller) {
      controller.abort();
      this.activeLoops.delete(runId);
    }
  }

  async invoke(input: RuntimeInput<string>, context: AgentContext): Promise<AgentRunResult> {
    let result: AgentRunResult | null = null;
    for await (const event of this.stream(input, context)) {
      if (event.type === 'completed') {
        result = event.result;
      }
      if (event.type === 'error' && !event.recoverable) {
        throw new Error(event.message);
      }
    }

    if (!result) {
      throw new Error(`AgentRun ${context.runId} finished without completed event`);
    }
    return result;
  }

  stream(input: RuntimeInput<string>, context: AgentContext): AsyncGenerator<AgentStreamEvent> {
    return this.start(input, context);
  }

  getAvailableTools(_permissions: PermissionContext): readonly ToolDefinition[] {
    return this.config.toolExecutor.getToolDefs().map((t) => ({
      name: t.name,
      description: t.description,
      schema: t.inputSchema,
      riskLevel: 'R0' as const,
      characteristics: { isReadOnly: true, isDestructive: false, isConcurrencySafe: true, isIdempotent: true, reversibility: 'reversible' as const, environmentSideEffects: [], maxOutputTokens: 4096 },
      timeout: 30000,
      retryable: false,
      execute: async () => ({ success: true, durationMs: 0 }),
    }));
  }

  async healthCheck(): Promise<HealthStatus> {
    return { healthy: true, checkedAt: new Date() };
  }
}
