export type FailureType =
  | 'timeout'
  | 'rate_limit'
  | 'server_error'
  | 'model_overloaded'
  | 'format_error'
  | 'tool_error'
  | 'hallucination'
  | 'budget_exhausted'
  | 'permission_denied';

export type RetryAction =
  | { readonly action: 'retry'; readonly delayMs: number; readonly strategy: 'same' | 'fallback_model' | 'simplified_prompt' }
  | { readonly action: 'abort'; readonly reason: string }
  | { readonly action: 'escalate'; readonly target: 'human' | 'supervisor_agent' };

export interface FailureContext {
  readonly type: FailureType;
  readonly message: string;
  readonly statusCode?: number;
  readonly retryAfterMs?: number;
}

/**
 * Retry Policy — 失败类型驱动的重试策略
 * @stability S2
 */
export class RetryPolicy {
  shouldRetry(failure: FailureContext, attempt: number): RetryAction {
    switch (failure.type) {
      case 'timeout':
        if (attempt >= 3) return { action: 'abort', reason: 'Max timeout retries exceeded' };
        return { action: 'retry', delayMs: 1000 * 2 ** attempt, strategy: 'same' };

      case 'rate_limit':
        if (attempt >= 5) return { action: 'abort', reason: 'Rate limit retries exceeded' };
        return { action: 'retry', delayMs: failure.retryAfterMs ?? 2000 * 2 ** attempt, strategy: 'same' };

      case 'server_error':
        if (attempt >= 3) return { action: 'retry', delayMs: 0, strategy: 'fallback_model' };
        return { action: 'retry', delayMs: 1000 * 2 ** attempt, strategy: 'same' };

      case 'model_overloaded':
        if (attempt >= 2) return { action: 'abort', reason: 'All models overloaded' };
        return { action: 'retry', delayMs: 0, strategy: 'fallback_model' };

      case 'format_error':
        if (attempt >= 2) return { action: 'abort', reason: 'Persistent format errors' };
        return { action: 'retry', delayMs: 0, strategy: 'simplified_prompt' };

      case 'tool_error':
        if (attempt >= 2) return { action: 'escalate', target: 'human' };
        return { action: 'retry', delayMs: 0, strategy: 'same' };

      case 'hallucination':
        if (attempt >= 1) return { action: 'abort', reason: 'Persistent hallucination' };
        return { action: 'retry', delayMs: 0, strategy: 'simplified_prompt' };

      case 'budget_exhausted':
        return { action: 'escalate', target: 'human' };

      case 'permission_denied':
        return { action: 'escalate', target: 'human' };
    }
  }
}
