/**
 * OpenTelemetry 链路追踪骨架
 * MVP: 提供 span 创建和上下文传播的抽象
 */
export interface TraceSpan {
  readonly traceId: string;
  readonly spanId: string;
  readonly name: string;
  readonly startTime: Date;
  endTime?: Date;
  readonly attributes: Record<string, string | number | boolean>;
  readonly events: readonly SpanEvent[];
}

export interface SpanEvent {
  readonly name: string;
  readonly timestamp: Date;
  readonly attributes?: Record<string, string | number | boolean>;
}

export class Tracer {
  private readonly spans: TraceSpan[] = [];

  startSpan(name: string, attributes?: Record<string, string | number | boolean>): TraceSpan {
    const span: TraceSpan = {
      traceId: crypto.randomUUID(),
      spanId: crypto.randomUUID(),
      name,
      startTime: new Date(),
      attributes: attributes ?? {},
      events: [],
    };
    this.spans.push(span);
    return span;
  }

  endSpan(span: TraceSpan): void {
    span.endTime = new Date();
  }

  getSpans(): readonly TraceSpan[] {
    return this.spans;
  }
}
