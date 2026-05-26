/** 工具风险等级 */
export type ToolRiskLevel = 'R0' | 'R1' | 'R2' | 'R3' | 'R4' | 'RX';

/** 环境维度 — 供回填引擎使用 */
export type EnvironmentDimension =
  | 'working_directory'
  | 'file_system'
  | 'git_state'
  | 'permissions'
  | 'external_system_state'
  | 'unknown'
  | 'none';

/**
 * 工具安全特征声明
 * Fail-Closed 默认值：未声明的特征默认为最安全选项
 * @stability S1
 */
export interface ToolSafetyCharacteristics {
  readonly isReadOnly: boolean;
  readonly isDestructive: boolean;
  readonly isConcurrencySafe: boolean;
  readonly isIdempotent: boolean;
  readonly reversibility: 'reversible' | 'partially' | 'irreversible' | 'unknown';
  readonly environmentSideEffects: readonly EnvironmentDimension[];
  readonly maxOutputTokens: number;
}

export interface ToolBackfillDeclaration {
  readonly affectedDimensions: readonly EnvironmentDimension[];
  readonly extractionStrategy: 'from_output' | 'from_side_effect' | 'manual_probe';
}

/**
 * 完整工具定义接口
 * @stability S1
 */
export interface ToolDefinition<TInput = unknown, TOutput = unknown> {
  readonly name: string;
  readonly description: string;
  readonly schema: Record<string, unknown>;
  readonly riskLevel: ToolRiskLevel;
  readonly characteristics: ToolSafetyCharacteristics;
  readonly timeout: number;
  readonly retryable: boolean;
  readonly maxRetries?: number;
  readonly backfillContext?: ToolBackfillDeclaration;
  execute(params: TInput, ctx: ToolContext): Promise<ToolResult<TOutput>>;
}

export interface ToolContext {
  readonly runId: string;
  readonly agentId: string;
  readonly tenantId: string;
  readonly turnIndex: number;
  readonly abortSignal: AbortSignal;
}

export interface ToolResult<T = unknown> {
  readonly success: boolean;
  readonly data?: T;
  readonly error?: string;
  readonly durationMs: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
}
