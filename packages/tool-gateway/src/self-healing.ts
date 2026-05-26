/**
 * 工具自愈矩阵 — Level 1-4 分级处理
 * 将错误转化为模型可理解的上下文
 * @stability S2
 */

export type SelfHealLevel = 'level1_timeout' | 'level2_schema' | 'level3_permission' | 'level4_unrecoverable';

export interface SelfHealResult {
  readonly level: SelfHealLevel;
  readonly recoverable: boolean;
  readonly feedbackForModel: string;
  readonly suggestedAction?: string;
}

export class ToolSelfHealing {
  classify(error: Error): SelfHealLevel {
    const msg = error.message.toLowerCase();
    if (msg.includes('timeout') || msg.includes('timed out') || msg.includes('aborted')) return 'level1_timeout';
    if (msg.includes('schema') || msg.includes('validation') || msg.includes('invalid')) return 'level2_schema';
    if (msg.includes('permission') || msg.includes('forbidden') || msg.includes('unauthorized')) return 'level3_permission';
    return 'level4_unrecoverable';
  }

  heal(toolName: string, error: Error, _params?: unknown): SelfHealResult {
    const level = this.classify(error);

    switch (level) {
      case 'level1_timeout':
        return {
          level,
          recoverable: true,
          feedbackForModel: `[TIMEOUT] Tool '${toolName}' timed out. Consider: retry with simpler parameters, or use an alternative tool.`,
          suggestedAction: 'retry_with_timeout_increase',
        };

      case 'level2_schema':
        return {
          level,
          recoverable: true,
          feedbackForModel: `[SCHEMA ERROR] Tool '${toolName}' rejected parameters: ${error.message}. Please fix the parameters and retry.`,
          suggestedAction: 'fix_parameters',
        };

      case 'level3_permission':
        return {
          level,
          recoverable: true,
          feedbackForModel: `[PERMISSION DENIED] Tool '${toolName}' access denied: ${error.message}. Choose an alternative tool or request approval.`,
          suggestedAction: 'use_alternative_tool',
        };

      case 'level4_unrecoverable':
        return {
          level,
          recoverable: false,
          feedbackForModel: `[UNRECOVERABLE ERROR] Tool '${toolName}' failed: ${error.message}. This error cannot be retried automatically.`,
        };
    }
  }
}
