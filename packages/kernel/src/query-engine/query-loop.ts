import type { AgentStreamEvent, ToolResult } from '@nexus/shared';
import type {
  ILLMProvider,
  LLMCallOptions,
  LLMMessage,
  LLMStreamChunk,
  LLMToolDef,
  QueryLoopConfig,
  ToolCall,
  TurnResult,
} from './types.js';
import { ResilientLoop } from './resilient-loop.js';
import type { HookRegistry } from '../lifecycle/hook-registry.js';
import type { CheckpointManager } from '../checkpoint/checkpoint-manager.js';
import type { CheckpointReason } from '../checkpoint/types.js';
import { CompactEngine } from '../compact/compact-engine.js';
import type { LLMMessageRef } from '../compact/types.js';

export interface ToolExecutor {
  execute(toolName: string, args: string, runId: string): Promise<ToolResult>;
  getToolDefs(): readonly LLMToolDef[];
}

export interface QueryLoopDeps {
  readonly provider: ILLMProvider;
  readonly fallbackProvider?: ILLMProvider;
  readonly toolExecutor: ToolExecutor;
  readonly hookRegistry?: HookRegistry;
  readonly checkpointManager?: CheckpointManager;
  readonly sessionSummaryProvider?: (runId: string) => Promise<string | null>;
  readonly config: QueryLoopConfig;
  readonly tenantId?: string;
  readonly agentId?: string;
}

/**
 * Query Loop — 薄内核推理环（集成版）
 * 内部调用 ResilientLoop + Lifecycle Hooks + Compact L1 + Checkpoint
 * @stability S1
 */
export class QueryLoop {
  private turnIndex = 0;
  private totalToolCalls = 0;
  private totalTokensUsed = 0;
  private readonly resilientLoop: ResilientLoop;
  private readonly compact: CompactEngine;
  private readonly hooks?: HookRegistry;
  private readonly checkpoint?: CheckpointManager;
  private readonly sessionSummaryProvider?: (runId: string) => Promise<string | null>;
  private readonly toolExecutor: ToolExecutor;
  private readonly config: QueryLoopConfig;
  private readonly tenantId: string;
  private readonly agentId: string;

  constructor(deps: QueryLoopDeps) {
    this.toolExecutor = deps.toolExecutor;
    this.config = deps.config;
    this.hooks = deps.hookRegistry;
    this.checkpoint = deps.checkpointManager;
    this.sessionSummaryProvider = deps.sessionSummaryProvider;
    this.tenantId = deps.tenantId ?? 'default';
    this.agentId = deps.agentId ?? '';
    this.resilientLoop = new ResilientLoop(deps.provider, deps.fallbackProvider);
    this.compact = new CompactEngine({ provider: deps.fallbackProvider ?? deps.provider });
  }

  async *run(messages: LLMMessage[], model: string, runId?: string): AsyncGenerator<AgentStreamEvent> {
    const effectiveRunId = runId ?? crypto.randomUUID();

    await this.hooks?.dispatch('pre_plan', {
      runId: effectiveRunId, tenantId: this.tenantId, agentId: this.agentId, turnIndex: 0, phase: 'pre_plan',
    });
    await this.hooks?.dispatch('post_plan', {
      runId: effectiveRunId, tenantId: this.tenantId, agentId: this.agentId, turnIndex: 0, phase: 'post_plan',
    });

    while (!this.shouldTerminate()) {
      this.turnIndex++;

      const preFlightResult = this.resilientLoop.preFlightCheck({
        budgetRemaining: this.config.budgetSnapshot.tokenBudget.remaining - this.totalTokensUsed,
        currentTokenCount: this.estimateTokenCount(messages),
        maxTokens: this.config.budgetSnapshot.tokenBudget.total,
        abortSignal: this.config.abortSignal,
      });

      if (!preFlightResult.pass) {
        yield { type: 'completed', result: this.buildResult(false), runId: effectiveRunId };
        return;
      }

      let turnResult: TurnResult;
      try {
        turnResult = await this.executeTurn(messages, model, effectiveRunId);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await this.hooks?.dispatch('on_error', {
          runId: effectiveRunId,
          tenantId: this.tenantId,
          agentId: this.agentId,
          turnIndex: this.turnIndex,
          phase: 'on_error',
          data: { error: message },
        });
        yield {
          type: 'error',
          code: 'QUERY_LOOP.UNHANDLED_ERROR',
          message,
          recoverable: false,
          runId: effectiveRunId,
        };
        yield { type: 'completed', result: this.buildResult(false), runId: effectiveRunId };
        return;
      }

      for (const event of turnResult.events) {
        yield event;
      }

      this.totalTokensUsed += turnResult.tokensUsed.input + turnResult.tokensUsed.output;
      const tokenUsage = this.totalTokensUsed;
      const tokenLimit = this.config.budgetSnapshot.tokenBudget.total;
      if (tokenUsage >= tokenLimit * 0.8) {
        yield { type: 'budget_warning', dimension: 'token', usage: tokenUsage, limit: tokenLimit, runId: effectiveRunId };
      }

      const compactEvent = await this.tryCompact(messages, effectiveRunId);
      if (compactEvent) {
        yield compactEvent;
      }

      if (this.checkpoint?.shouldCheckpoint('periodic_interval')) {
        yield { type: 'checkpoint', checkpointId: crypto.randomUUID(), turnCount: this.turnIndex, runId: effectiveRunId };
        await this.hooks?.dispatch('on_checkpoint', {
          runId: effectiveRunId, tenantId: this.tenantId, agentId: this.agentId, turnIndex: this.turnIndex, phase: 'on_checkpoint',
        });
      }

      if (turnResult.terminated) {
        if (turnResult.terminationReason === 'approval_required') {
          return;
        }
        await this.hooks?.dispatch('pre_complete', {
          runId: effectiveRunId, tenantId: this.tenantId, agentId: this.agentId, turnIndex: this.turnIndex, phase: 'pre_complete',
        });
        await this.hooks?.dispatch('post_complete', {
          runId: effectiveRunId, tenantId: this.tenantId, agentId: this.agentId, turnIndex: this.turnIndex, phase: 'post_complete',
        });
        yield { type: 'completed', result: this.buildResult(turnResult.terminationReason === 'no_tool_use'), runId: effectiveRunId };
        return;
      }
    }

    yield { type: 'completed', result: this.buildResult(false), runId: effectiveRunId };
  }

  private async executeTurn(messages: LLMMessage[], model: string, runId: string): Promise<TurnResult> {
    const events: AgentStreamEvent[] = [];
    const toolCalls: ToolCall[] = [];
    let tokensUsed = { input: 0, output: 0 };
    const pendingToolCalls = new Map<string, { name: string; args: string }>();

    const options: LLMCallOptions = {
      model,
      tools: this.toolExecutor.getToolDefs(),
      abortSignal: this.config.abortSignal,
    };

    const stream = this.resilientLoop.invokeWithFallback(messages, options, runId);

    for await (const chunk of stream) {
      if (this.isStreamEvent(chunk)) {
        events.push(chunk);
        continue;
      }
      const llmChunk = chunk as LLMStreamChunk;
      switch (llmChunk.type) {
        case 'text_delta':
          events.push({ type: 'text_delta', delta: llmChunk.delta, runId });
          break;
        case 'tool_call_start':
          pendingToolCalls.set(llmChunk.id, { name: llmChunk.name, args: '' });
          events.push({ type: 'tool_use_start', toolName: llmChunk.name, toolCallId: llmChunk.id, input: null, runId });
          break;
        case 'tool_call_delta': {
          const pending = pendingToolCalls.get(llmChunk.id);
          if (pending) pending.args += llmChunk.argumentsDelta;
          break;
        }
        case 'tool_call_end': {
          const completed = pendingToolCalls.get(llmChunk.id);
          if (completed) toolCalls.push({ id: llmChunk.id, name: completed.name, arguments: completed.args });
          break;
        }
        case 'done':
          tokensUsed = llmChunk.usage;
          break;
      }
    }

    void this.hooks?.dispatch('post_sampling', {
      runId,
      tenantId: this.tenantId,
      agentId: this.agentId,
      turnIndex: this.turnIndex,
      phase: 'post_sampling',
    });

    const postModelCheckpoint = await this.saveCheckpoint('post_model_output', runId, messages);
    if (postModelCheckpoint) {
      events.push(postModelCheckpoint);
    }

    if (toolCalls.length === 0) {
      return { turnIndex: this.turnIndex, events, toolCalls, terminated: true, terminationReason: 'no_tool_use', tokensUsed };
    }

    for (const tc of toolCalls) {
      await this.hooks?.dispatch('pre_tool', {
        runId, tenantId: this.tenantId, agentId: this.agentId, turnIndex: this.turnIndex, phase: 'pre_tool',
        data: { toolName: tc.name, toolCallId: tc.id },
      });

      const startTime = Date.now();
      const result = await this.toolExecutor.execute(tc.name, tc.arguments, runId);
      const durationMs = Date.now() - startTime;
      this.totalToolCalls++;

      if (result.metadata?.['requiresApproval'] === true) {
        const requestId = crypto.randomUUID();
        events.push({
          type: 'approval_required',
          requestId,
          toolName: tc.name,
          reason: String(result.metadata['reason'] ?? result.error ?? 'Tool requires approval'),
          runId,
        });
        const checkpointEvent = await this.saveCheckpoint('pre_approval_wait', runId, messages);
        if (checkpointEvent) events.push(checkpointEvent);
        return { turnIndex: this.turnIndex, events, toolCalls, terminated: true, terminationReason: 'approval_required', tokensUsed };
      }

      if (result.success) {
        events.push({ type: 'tool_use_result', toolName: tc.name, toolCallId: tc.id, result: result.data, durationMs, runId });
      } else {
        const selfHealFeedback = `[ERROR: ${result.error}] Tool '${tc.name}' failed. Consider alternative approach.`;
        events.push({ type: 'tool_use_error', toolName: tc.name, toolCallId: tc.id, error: result.error ?? 'Unknown error', recoverable: true, runId });
        events.push({ type: 'self_heal', toolName: tc.name, strategy: 'error_feedback', runId });
        messages.push({ role: 'tool', content: selfHealFeedback, toolCallId: tc.id });
        continue;
      }

      await this.hooks?.dispatch('post_tool', {
        runId, tenantId: this.tenantId, agentId: this.agentId, turnIndex: this.turnIndex, phase: 'post_tool',
        data: { toolName: tc.name, toolCallId: tc.id, durationMs },
      });

      messages.push({ role: 'tool', content: JSON.stringify(result.data ?? result.error), toolCallId: tc.id, timestamp: new Date() });

      const checkpointEvent = await this.saveCheckpoint('post_tool_execution', runId, messages);
      if (checkpointEvent) {
        events.push(checkpointEvent);
      }
    }

    const assistantContent = events
      .filter((e): e is AgentStreamEvent & { type: 'text_delta' } => e.type === 'text_delta')
      .map((e) => e.delta)
      .join('');

    if (assistantContent || toolCalls.length > 0) {
      messages.push({ role: 'assistant', content: assistantContent, toolCalls: toolCalls.length > 0 ? toolCalls : undefined });
    }

    return { turnIndex: this.turnIndex, events, toolCalls, terminated: false, tokensUsed };
  }

  private async tryCompact(messages: LLMMessage[], runId: string): Promise<AgentStreamEvent | null> {
    const refs = this.buildMessageRefs(messages);
    const contents = messages.map((m) => typeof m.content === 'string' ? m.content : JSON.stringify(m.content));
    const mutableRefs = [...refs];
    const sessionSummary = await this.sessionSummaryProvider?.(runId) ?? null;
    const result = await this.compact.compact(mutableRefs, contents, {
      currentTokenCount: this.estimateTokenCount(messages),
      maxTokens: this.config.budgetSnapshot.tokenBudget.total,
      turnIndex: this.turnIndex,
      sessionSummary,
    });

    if (!result) {
      return null;
    }

    for (let i = 0; i < messages.length; i++) {
      if (contents[i] !== undefined && messages[i]) {
        (messages[i] as { content: string }).content = contents[i]!;
      }
    }

    this.compact.registry.evict(this.turnIndex);
    await this.hooks?.dispatch('on_compact', {
      runId,
      tenantId: this.tenantId,
      agentId: this.agentId,
      turnIndex: this.turnIndex,
      phase: 'on_compact',
      data: { level: result.level, tokensFreed: result.tokensFreed },
    });
    await this.saveCheckpoint('post_compact', runId, messages);

    return {
      type: 'compact',
      level: result.level,
      tokensFreed: result.tokensFreed,
      evidencePreserved: result.evidencePreserved,
      runId,
    };
  }

  private async saveCheckpoint(
    reason: CheckpointReason,
    runId: string,
    messages: readonly LLMMessage[],
  ): Promise<AgentStreamEvent | null> {
    if (!this.checkpoint?.shouldCheckpoint(reason)) {
      return null;
    }

    const checkpointId = await this.checkpoint.save({
      runId,
      messages,
      budget: this.config.budgetSnapshot,
      turnCount: this.turnIndex,
      createdAt: new Date(),
      reason,
    });

    if (!checkpointId) {
      return null;
    }

    return { type: 'checkpoint', checkpointId, turnCount: this.turnIndex, runId };
  }

  private buildMessageRefs(messages: readonly LLMMessage[]): LLMMessageRef[] {
    return messages.map((m, i) => ({
      index: i,
      role: m.role,
      tokenCount: Math.ceil((typeof m.content === 'string' ? m.content.length : 100) / 4),
      timestamp: m.timestamp ?? new Date(),
      toolName: m.toolCallId ? 'tool' : undefined,
      toolResultSize: m.role === 'tool' ? (typeof m.content === 'string' ? m.content.length : 0) : undefined,
    }));
  }

  private estimateTokenCount(messages: readonly LLMMessage[]): number {
    return messages.reduce((sum, m) => sum + Math.ceil((typeof m.content === 'string' ? m.content.length : 100) / 4), 0);
  }

  private buildResult(success: boolean) {
    return { success, tokensUsed: this.totalTokensUsed, turnsExecuted: this.turnIndex, toolCallsCount: this.totalToolCalls };
  }

  private shouldTerminate(): boolean {
    if (this.config.abortSignal.aborted) return true;
    if (this.turnIndex >= this.config.maxTurns) return true;
    if (this.config.budgetSnapshot.tokenBudget.remaining - this.totalTokensUsed <= 0) return true;
    return false;
  }

  private isStreamEvent(chunk: unknown): chunk is AgentStreamEvent {
    return typeof chunk === 'object' && chunk !== null && 'runId' in chunk && 'type' in chunk && (chunk as { type: string }).type === 'model_fallback';
  }
}
