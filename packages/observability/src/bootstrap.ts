import { NexusLogger } from './logs/index.js';
import { OpenTelemetryMetrics } from './metrics/index.js';
import { OpenTelemetryManager } from './traces/index.js';

export interface ObservabilityRuntime {
  readonly traces: OpenTelemetryManager;
  readonly metrics: OpenTelemetryMetrics;
  readonly logger: NexusLogger;
  shutdown(): Promise<void>;
}

/** 初始化 Phase 1 MVP 可观测性组件。 */
export function bootstrapObservability(serviceName = 'nexus'): ObservabilityRuntime {
  const traces = new OpenTelemetryManager();
  const metrics = new OpenTelemetryMetrics();
  const logger = new NexusLogger();
  traces.start(serviceName);
  return {
    traces,
    metrics,
    logger,
    shutdown: () => traces.shutdown(),
  };
}
