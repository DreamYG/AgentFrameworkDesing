import { describe, expect, it } from 'vitest';
import { GracefulShutdownController } from '../src/index.js';

describe('GracefulShutdownController', () => {
  it('forces active runs to abort after grace period', async () => {
    const shutdown = new GracefulShutdownController({ gracePeriodMs: 1 });
    const controller = new AbortController();
    shutdown.registerActiveRun('run-1', controller);

    const result = await shutdown.drain('SIGTERM');

    expect(result.totalRuns).toBe(1);
    expect(result.checkpointedForcefully).toBe(1);
    expect(controller.signal.aborted).toBe(true);
    expect(shutdown.getStatus()).toBe('terminated');
    expect(shutdown.getActiveRunCount()).toBe(0);
  });

  it('waits for runs to complete naturally within grace period', async () => {
    const shutdown = new GracefulShutdownController({ gracePeriodMs: 500 });
    const controller = new AbortController();
    shutdown.registerActiveRun('run-complete', controller);

    // 模拟 Run 在 150ms 内自然完成
    setTimeout(() => shutdown.deregisterRun('run-complete'), 150);

    const result = await shutdown.drain('SIGTERM');
    expect(result.totalRuns).toBe(1);
    expect(result.checkpointedForcefully).toBe(0);
    expect(result.completedNormally).toBe(1);
    expect(controller.signal.aborted).toBe(false);
  });
});
