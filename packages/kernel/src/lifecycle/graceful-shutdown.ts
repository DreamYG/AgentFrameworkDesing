/**
 * Graceful Shutdown Controller
 * SIGTERM → 三阶段排水：标记 draining → 等待完成 → force checkpoint
 * @stability S1
 */
export interface DrainResult {
  readonly totalRuns: number;
  readonly completedNormally: number;
  readonly checkpointedForcefully: number;
  readonly durationMs: number;
}

export type ShutdownStatus = 'running' | 'draining' | 'force_saving' | 'terminated';

export class GracefulShutdownController {
  private status: ShutdownStatus = 'running';
  private readonly activeRuns = new Map<string, AbortController>();
  private readonly gracePeriodMs: number;

  constructor(options?: { gracePeriodMs?: number }) {
    this.gracePeriodMs = options?.gracePeriodMs ?? 30000;
  }

  registerActiveRun(runId: string, controller: AbortController): void {
    this.activeRuns.set(runId, controller);
  }

  deregisterRun(runId: string): void {
    this.activeRuns.delete(runId);
  }

  getStatus(): ShutdownStatus {
    return this.status;
  }

  getActiveRunCount(): number {
    return this.activeRuns.size;
  }

  /**
   * 执行排水流程
   */
  async drain(_signal: 'SIGTERM' | 'SIGINT'): Promise<DrainResult> {
    const startTime = Date.now();
    this.status = 'draining';

    // Phase 1: Mark draining (immediate)
    const totalRuns = this.activeRuns.size;

    // Phase 2: Wait for graceful completion
    let completedNormally = 0;
    const deadline = Date.now() + this.gracePeriodMs;

    while (this.activeRuns.size > 0 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      const currentSize = this.activeRuns.size;
      if (currentSize < totalRuns - completedNormally) {
        completedNormally = totalRuns - currentSize;
      }
    }

    // Phase 3: Force abort remaining
    this.status = 'force_saving';
    let checkpointedForcefully = 0;
    for (const [runId, controller] of this.activeRuns) {
      controller.abort();
      this.activeRuns.delete(runId);
      checkpointedForcefully++;
    }

    this.status = 'terminated';
    return {
      totalRuns,
      completedNormally,
      checkpointedForcefully,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * 注册进程信号处理器
   */
  installSignalHandlers(onDrain: (result: DrainResult) => void): void {
    const handler = async (signal: string) => {
      if (this.status !== 'running') return;
      const result = await this.drain(signal as 'SIGTERM');
      onDrain(result);
      process.exit(0);
    };

    process.on('SIGTERM', () => void handler('SIGTERM'));
    process.on('SIGINT', () => void handler('SIGINT'));
  }
}
