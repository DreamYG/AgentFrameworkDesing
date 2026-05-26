/**
 * Metrics 收集骨架
 * MVP: 计数器和直方图
 */
export interface MetricPoint {
  readonly name: string;
  readonly value: number;
  readonly labels: Record<string, string>;
  readonly timestamp: Date;
}

export class MetricsCollector {
  private readonly counters = new Map<string, number>();
  private readonly histograms = new Map<string, number[]>();

  increment(name: string, labels?: Record<string, string>, value = 1): void {
    const key = this.makeKey(name, labels);
    this.counters.set(key, (this.counters.get(key) ?? 0) + value);
  }

  observe(name: string, value: number, labels?: Record<string, string>): void {
    const key = this.makeKey(name, labels);
    const values = this.histograms.get(key) ?? [];
    values.push(value);
    this.histograms.set(key, values);
  }

  getCounter(name: string, labels?: Record<string, string>): number {
    return this.counters.get(this.makeKey(name, labels)) ?? 0;
  }

  getHistogram(name: string, labels?: Record<string, string>): readonly number[] {
    return this.histograms.get(this.makeKey(name, labels)) ?? [];
  }

  private makeKey(name: string, labels?: Record<string, string>): string {
    if (!labels) return name;
    const sorted = Object.entries(labels).sort(([a], [b]) => a.localeCompare(b));
    return `${name}{${sorted.map(([k, v]) => `${k}="${v}"`).join(',')}}`;
  }
}
