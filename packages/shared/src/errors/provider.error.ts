import { NexusError } from './nexus-error.js';

/** LLM Provider 通信失败 */
export class ProviderError extends NexusError {
  constructor(message: string, retryable: boolean, context?: Record<string, unknown>) {
    super(message, 'PROVIDER.COMMUNICATION_FAILED', retryable, context);
  }
}

/** Provider 速率限制 */
export class ProviderRateLimitError extends NexusError {
  constructor(provider: string, retryAfterMs?: number) {
    super(`Provider ${provider} rate limited`, 'PROVIDER.RATE_LIMITED', true, { provider, retryAfterMs });
  }
}
