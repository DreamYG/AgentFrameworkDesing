import { context, trace, type Span, SpanStatusCode } from '@opentelemetry/api';
import { NodeSDK } from '@opentelemetry/sdk-node';

/** OpenTelemetry SDK 管理器：负责 SDK 启停、span 创建与上下文传播 */
export class OpenTelemetryManager {
  private sdk: NodeSDK | null = null;

  start(serviceName: string): void {
    this.sdk = new NodeSDK({ serviceName });
    this.sdk.start();
  }

  async shutdown(): Promise<void> {
    await this.sdk?.shutdown();
  }

  startSpan(name: string, attributes?: Record<string, string | number | boolean>): Span {
    const span = trace.getTracer('nexus').startSpan(name);
    for (const [key, value] of Object.entries(attributes ?? {})) {
      span.setAttribute(key, value);
    }
    return span;
  }

  async withSpan<T>(
    name: string,
    attributes: Record<string, string | number | boolean>,
    fn: () => Promise<T>,
  ): Promise<T> {
    const span = this.startSpan(name, attributes);
    return context.with(trace.setSpan(context.active(), span), async () => {
      try {
        const result = await fn();
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        span.recordException(error as Error);
        span.setStatus({ code: SpanStatusCode.ERROR });
        throw error;
      } finally {
        span.end();
      }
    });
  }
}
