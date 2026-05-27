import pino from 'pino';

export interface LoggerContext {
  readonly traceId?: string;
  readonly runId?: string;
  readonly agentId?: string;
  readonly tenantId?: string;
}

export type NexusLogMode = 'dev' | 'debug';

/** Pino 结构化日志 */
export class NexusLogger {
  private readonly mode: NexusLogMode;
  private readonly logger = pino({
    name: 'nexus',
    level: process.env['LOG_LEVEL'] ?? (process.env['NEXUS_LOG_MODE'] === 'debug' ? 'debug' : 'info'),
    redact: ['apiKey', 'password', 'secret', '*.token', '*.authorization'],
  });

  constructor(options?: { mode?: NexusLogMode }) {
    this.mode = options?.mode ?? (process.env['NEXUS_LOG_MODE'] === 'debug' ? 'debug' : 'dev');
  }

  child(ctx: LoggerContext): pino.Logger {
    return this.logger.child(ctx);
  }

  info(ctx: LoggerContext, message: string, data?: Record<string, unknown>): void {
    this.child(ctx).info(data ?? {}, message);
  }

  flow(ctx: LoggerContext, message: string, data?: Record<string, unknown>): void {
    this.child(ctx).info({ mode: this.mode, ...(data ?? {}) }, message);
  }

  debug(ctx: LoggerContext, message: string, data?: Record<string, unknown>): void {
    if (this.mode !== 'debug') return;
    this.child(ctx).debug(data ?? {}, message);
  }

  warn(ctx: LoggerContext, message: string, data?: Record<string, unknown>): void {
    this.child(ctx).warn(data ?? {}, message);
  }

  error(ctx: LoggerContext, message: string, error?: unknown): void {
    this.child(ctx).error({ error }, message);
  }
}
