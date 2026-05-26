import type { AgentStreamEvent, BudgetSnapshot, ToolCall } from '@nexus/shared';

export type {
  ILLMProvider,
  LLMCallOptions,
  LLMMessage,
  LLMStreamChunk,
  LLMToolDef,
  ToolCall,
  ContentPart,
} from '@nexus/shared';

/** Query Loop 配置 */
export interface QueryLoopConfig {
  readonly maxTurns: number;
  readonly maxToolCallsPerTurn: number;
  readonly budgetSnapshot: BudgetSnapshot;
  readonly abortSignal: AbortSignal;
}

/** 单轮 Turn 结果 */
export interface TurnResult {
  readonly turnIndex: number;
  readonly events: readonly AgentStreamEvent[];
  readonly toolCalls: readonly ToolCall[];
  readonly terminated: boolean;
  readonly terminationReason?: TerminationReason;
  readonly tokensUsed: { input: number; output: number };
}

/** 终止原因 */
export type TerminationReason =
  | 'no_tool_use'
  | 'budget_exhausted'
  | 'max_turns_reached'
  | 'abort_signal'
  | 'error'
  | 'approval_required';
