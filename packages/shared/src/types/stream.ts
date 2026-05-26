/**
 * Agent 流式事件联合类型 — 覆盖推理循环全生命周期
 * @stability S0
 */
export type AgentStreamEvent =
  | { readonly type: 'text_delta'; readonly delta: string; readonly runId: string }
  | { readonly type: 'reasoning_summary_delta'; readonly delta: string; readonly runId: string }
  | { readonly type: 'tool_use_start'; readonly toolName: string; readonly toolCallId: string; readonly input: unknown; readonly runId: string }
  | { readonly type: 'tool_use_result'; readonly toolName: string; readonly toolCallId: string; readonly result: unknown; readonly durationMs: number; readonly runId: string }
  | { readonly type: 'tool_use_error'; readonly toolName: string; readonly toolCallId: string; readonly error: string; readonly recoverable: boolean; readonly runId: string }
  | { readonly type: 'approval_required'; readonly requestId: string; readonly toolName: string; readonly reason: string; readonly runId: string }
  | { readonly type: 'checkpoint'; readonly checkpointId: string; readonly turnCount: number; readonly runId: string }
  | { readonly type: 'compact'; readonly level: CompactLevel; readonly tokensFreed: number; readonly evidencePreserved: number; readonly runId: string }
  | { readonly type: 'model_fallback'; readonly from: string; readonly to: string; readonly reason: string; readonly runId: string }
  | { readonly type: 'budget_warning'; readonly dimension: string; readonly usage: number; readonly limit: number; readonly runId: string }
  | { readonly type: 'environment_change'; readonly dimension: string; readonly before: string; readonly after: string; readonly runId: string }
  | { readonly type: 'self_heal'; readonly toolName: string; readonly strategy: string; readonly runId: string }
  | { readonly type: 'error'; readonly code: string; readonly message: string; readonly recoverable: boolean; readonly runId: string }
  | { readonly type: 'completed'; readonly result: AgentRunResult; readonly runId: string };

export type CompactLevel = 'L1_time_gap' | 'L2_evidence' | 'L3_session_graft' | 'L4_legacy';

export interface AgentRunResult {
  readonly success: boolean;
  readonly output?: string;
  readonly tokensUsed: number;
  readonly turnsExecuted: number;
  readonly toolCallsCount: number;
}

/** 流式传递信封 */
export interface StreamDeliveryEnvelope {
  readonly runId: string;
  readonly sequence: number;
  readonly event: AgentStreamEvent;
  readonly createdAt: Date;
}

export interface StreamConsumerOptions {
  readonly consumerId: string;
  readonly fromSequence?: number;
  readonly maxInFlight: number;
}

/**
 * Agent 流式事件 Broker 端口
 * @stability S1
 */
export interface IAgentStreamBroker {
  publish(envelope: StreamDeliveryEnvelope): Promise<void>;
  subscribe(runId: string, options: StreamConsumerOptions): AsyncIterable<StreamDeliveryEnvelope>;
  ack(runId: string, consumerId: string, sequence: number): Promise<void>;
  replay(runId: string, fromSequence: number): AsyncIterable<StreamDeliveryEnvelope>;
}
