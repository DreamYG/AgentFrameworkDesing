import type {
  ToolDefinition,
  ToolSafetyCharacteristics,
  ToolRiskLevel,
  EnvironmentDimension,
} from '@nexus/shared';

/**
 * buildTool 工厂 — 所有工具必须通过此工厂注册
 * Fail-Closed 默认值：未声明的特征默认为最安全选项
 * @stability S1
 */

const FAIL_CLOSED_DEFAULTS: ToolSafetyCharacteristics = {
  isReadOnly: false,
  isDestructive: true,
  isConcurrencySafe: false,
  isIdempotent: false,
  reversibility: 'unknown',
  environmentSideEffects: ['unknown'] as readonly EnvironmentDimension[],
  maxOutputTokens: 4096,
};

export function buildTool<TInput = unknown, TOutput = unknown>(
  spec: Partial<ToolDefinition<TInput, TOutput>> & {
    name: string;
    description: string;
    execute: ToolDefinition<TInput, TOutput>['execute'];
  },
): ToolDefinition<TInput, TOutput> {
  return {
    name: spec.name,
    description: spec.description,
    schema: spec.schema ?? {},
    riskLevel: spec.riskLevel ?? inferRiskLevel(spec.characteristics),
    characteristics: {
      ...FAIL_CLOSED_DEFAULTS,
      ...spec.characteristics,
    },
    timeout: spec.timeout ?? 30000,
    retryable: spec.retryable ?? false,
    maxRetries: spec.maxRetries,
    backfillContext: spec.backfillContext,
    execute: spec.execute,
  };
}

function inferRiskLevel(chars?: Partial<ToolSafetyCharacteristics>): ToolRiskLevel {
  if (!chars) return 'R2';
  if (chars.isReadOnly) return 'R0';
  if (!chars.isDestructive && chars.reversibility === 'reversible') return 'R1';
  if (chars.isDestructive && chars.reversibility === 'irreversible') return 'R3';
  return 'R2';
}

export { FAIL_CLOSED_DEFAULTS };
