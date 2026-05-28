/**
 * 通用重试工具。
 * 指数退避 + 抖动 + 可选 isRetryable 判定。
 * @stability S0
 */

export interface RetryOptions {
  /** 最大尝试次数（含首次），默认 3 */
  readonly maxAttempts?: number;
  /** 初始退避（毫秒），默认 500 */
  readonly baseDelayMs?: number;
  /** 退避上限（毫秒），默认 10_000 */
  readonly maxDelayMs?: number;
  /** 退避因子，默认 2（指数退避） */
  readonly factor?: number;
  /** 抖动比例 0-1，默认 0.2 */
  readonly jitter?: number;
  /** 自定义可重试判定，未提供时默认所有异常都重试 */
  readonly isRetryable?: (error: unknown) => boolean;
  /** 中止信号 */
  readonly abortSignal?: AbortSignal;
  /** 每次失败的回调（便于埋点） */
  readonly onRetry?: (attempt: number, error: unknown, nextDelayMs: number) => void;
}

/**
 * 重试包装：返回首个成功结果，所有 attempt 失败则抛出最后一次错误。
 */
export async function retry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 3;
  const baseDelay = options.baseDelayMs ?? 500;
  const maxDelay = options.maxDelayMs ?? 10_000;
  const factor = options.factor ?? 2;
  const jitter = options.jitter ?? 0.2;
  const isRetryable = options.isRetryable ?? (() => true);

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (options.abortSignal?.aborted) throw new Error('retry aborted');
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts || !isRetryable(error)) throw error;
      const delay = computeDelay(attempt, baseDelay, maxDelay, factor, jitter);
      options.onRetry?.(attempt, error, delay);
      await sleep(delay, options.abortSignal);
    }
  }
  throw lastError;
}

function computeDelay(attempt: number, base: number, max: number, factor: number, jitter: number): number {
  const expo = Math.min(base * Math.pow(factor, attempt - 1), max);
  const jitterAmount = expo * jitter * (Math.random() * 2 - 1);
  return Math.max(0, Math.round(expo + jitterAmount));
}

function sleep(ms: number, abortSignal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (abortSignal?.aborted) {
      reject(new Error('sleep aborted'));
      return;
    }
    const timer = setTimeout(resolve, ms);
    abortSignal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new Error('sleep aborted'));
    }, { once: true });
  });
}
