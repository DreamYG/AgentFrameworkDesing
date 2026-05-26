import type { AgentStreamEvent, ToolResult } from '@nexus/shared';
import type {
  ILLMProvider,
  LLMCallOptions,
  LLMMessage,
  LLMToolDef,
  QueryLoopConfig,
  ToolCall,
  TurnResult,
} from './types.js';

export interface ToolExecutor {
  execute(toolName: string, args: string, runId: string): Promise<ToolResult>;
  getToolDefs(): readonly LLMToolDef[];
}

/**
 * Query Loop — 薄内核推理环
 * 职责：单 Run 内 while 循环、工具分发、终止判定
 * 不做：业务路由、审批判定、状态机管理
 * @stability S1
 */
export class QueryLoop {
  private turnIndex = 0;

  constructor(
    private readonly provider: ILLMProvider,
    private readonly toolExecutor: ToolExecutor,
    private readonly config: QueryLoopConfig,
  ) {}

  async *run(
    messages: LLMMessage[],
    model: string,
  ): AsyncGenerator<AgentStreamEvent> {
    const runId = crypto.randomUUID();

    while (!this.shouldTerminate()) {
      this.turnIndex++;
      const turnResult = await this.executeTurn(messages, model, runId);

      for (const event of turnResult.events) {
        yield event;
      }

      if (turnResult.terminated) {
        yield {
          type: 'completed',
          result: {
            success: turnResult.terminationReason === 'no_tool_use',
            tokensUsed: turnResult.tokensUsed.input + turnResult.tokensUsed.output,
            turnsExecuted: this.turnIndex,
            toolCallsCount: turnResult.toolCalls.length,
          },
          runId,
        };
        return;
      }
    }

    yield {
      type: 'completed',
      result: {
        success: false,
        tokensUsed: 0,
        turnsExecuted: this.turnIndex,
        toolCallsCount: 0,
      },
      runId,
    };
  }

  private async executeTurn(
    messages: LLMMessage[],
    model: string,
    runId: string,
  ): Promise<TurnResult> {
    const events: AgentStreamEvent[] = [];
    const toolCalls: ToolCall[] = [];
    let tokensUsed = { input: 0, output: 0 };
    const pendingToolCalls = new Map<string, { name: string; args: string }>();

    const options: LLMCallOptions = {
      model,
      tools: this.toolExecutor.getToolDefs(),
      abortSignal: this.config.abortSignal,
    };

    const stream = this.provider.chat(messages, options);

    for await (const chunk of stream) {
      switch (chunk.type) {
        case 'text_delta':
          events.push({ type: 'text_delta', delta: chunk.delta, runId });
          break;
        case 'tool_call_start':
          pendingToolCalls.set(chunk.id, { name: chunk.name, args: '' });
          events.push({
            type: 'tool_use_start',
            toolName: chunk.name,
            toolCallId: chunk.id,
            input: null,
            runId,
          });
          break;
        case 'tool_call_delta': {
          const pending = pendingToolCalls.get(chunk.id);
          if (pending) pending.args += chunk.argumentsDelta;
          break;
        }
        case 'tool_call_end': {
          const completed = pendingToolCalls.get(chunk.id);
          if (completed) {
            toolCalls.push({ id: chunk.id, name: completed.name, arguments: completed.args });
          }
          break;
        }
        case 'done':
          tokensUsed = chunk.usage;
          break;
      }
    }

    if (toolCalls.length === 0) {
      return {
        turnIndex: this.turnIndex,
        events,
        toolCalls,
        terminated: true,
        terminationReason: 'no_tool_use',
        tokensUsed,
      };
    }

    for (const tc of toolCalls) {
      const startTime = Date.now();
      const result = await this.toolExecutor.execute(tc.name, tc.arguments, runId);
      const durationMs = Date.now() - startTime;

      if (result.success) {
        events.push({
          type: 'tool_use_result',
          toolName: tc.name,
          toolCallId: tc.id,
          result: result.data,
          durationMs,
          runId,
        });
      } else {
        events.push({
          type: 'tool_use_error',
          toolName: tc.name,
          toolCallId: tc.id,
          error: result.error ?? 'Unknown error',
          recoverable: true,
          runId,
        });
      }

      messages.push({
        role: 'tool',
        content: JSON.stringify(result.data ?? result.error),
        toolCallId: tc.id,
      });
    }

    const assistantContent = events
      .filter((e) => e.type === 'text_delta')
      .map((e) => (e as { delta: string }).delta)
      .join('');

    if (assistantContent || toolCalls.length > 0) {
      messages.push({
        role: 'assistant',
        content: assistantContent,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      });
    }

    return {
      turnIndex: this.turnIndex,
      events,
      toolCalls,
      terminated: false,
      tokensUsed,
    };
  }

  private shouldTerminate(): boolean {
    if (this.config.abortSignal.aborted) return true;
    if (this.turnIndex >= this.config.maxTurns) return true;
    if (this.config.budgetSnapshot.tokenBudget.remaining <= 0) return true;
    return false;
  }
}
