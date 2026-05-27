import { metrics, type Counter, type Histogram, type Meter } from '@opentelemetry/api';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';

/** OpenTelemetry Metrics + Prometheus exporter */
export class OpenTelemetryMetrics {
  readonly exporter: PrometheusExporter;
  private readonly meter: Meter;
  private readonly counters = new Map<string, Counter>();
  private readonly histograms = new Map<string, Histogram>();

  constructor(options?: { port?: number; endpoint?: string }) {
    this.exporter = new PrometheusExporter({
      port: options?.port ?? 9464,
      endpoint: options?.endpoint ?? '/metrics',
    });
    this.meter = metrics.getMeter('nexus');
  }

  increment(name: string, value = 1, attributes?: Record<string, string | number | boolean>): void {
    const counter = this.counters.get(name) ?? this.meter.createCounter(name);
    this.counters.set(name, counter);
    counter.add(value, attributes);
  }

  observe(name: string, value: number, attributes?: Record<string, string | number | boolean>): void {
    const histogram = this.histograms.get(name) ?? this.meter.createHistogram(name);
    this.histograms.set(name, histogram);
    histogram.record(value, attributes);
  }
}
